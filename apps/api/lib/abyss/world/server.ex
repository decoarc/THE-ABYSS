defmodule Abyss.World.Server do
  @moduledoc """
  Único processo dono do mundo. Avança o `Sim` puro em cadência fixa, sem
  deriva (cada disparo é agendado contra o relógio monotônico de partida),
  transmite cada tick e mede jitter.
  """

  # O supervisor espera o `terminate/2` (sync do Recorder até 5 s + fotografia até
  # `shutdown_save_ms`, 10 s) antes de matar; o compose dá 30 s (`stop_grace_period`).
  use GenServer, shutdown: 28_000

  alias Abyss.Genesis.Catalog
  alias Abyss.World.Map, as: WMap
  alias Abyss.World.{Observers, Reconcile, Sim, Wire}

  require Logger

  @ring_size 600

  # --- API ---

  @doc "opts: população/seed/tick_hz, `creature_scale`, `test_species`, `food_boost` e `mutation_boost` (medição), `catalog` (padrão `Catalog.get/0`), `map_path` (padrão: config :map_path), `name` (nil = anônimo), `broadcast`, `species_loader` (`(-> %{live: [Species.t], extinct: [{Species.t, ms}], branch_seq: %{mãe => k}})`, chamado no init; `branch_seq` é opcional) e `on_extinct` (`([{String.t, ms}] -> any)`, extinções de espécies criadas após cada passo), `step` (`(Sim.t, dt, ms -> Sim.t)`, padrão `Sim.step/3`; injeção para testes) e `on_branch` (`([Species.t] -> any)`, ramos nascidos no passo, `born_ms` em hora real).

  Relógio do mundo (gate P): `world_ms = hora real − clock_offset_ms` (padrão 0). Tudo no `Sim`
  usa o relógio do mundo; datas que saem para o banco e para o fio (nascimento de espécie e
  ramo, extinção) são convertidas para hora real aqui e no `Wire`. `epoch` (padrão 1) numera o
  mundo desde o último recomeço. `on_extinct` recebe `[%{id, at_ms, world_ms, epoch, cause,
  predator}]` (só criadas); `on_deaths` (`([{id, causa, predador | nil}], world_ms, tick, epoch
  -> any)`) recebe as mortes de criadas do passo, quando há alguma.

  Fotografia (gate P): `persist` (`%{save: (payload -> :ok | :busy), save_sync: (payload,
  timeout -> any), flush: (-> any), sync: (-> any)}`, padrão nil = sem fotografia) e
  `snapshot_s` (intervalo; nil = só no desligamento). A cada intervalo: `flush` (mortes
  acumuladas do Recorder) e depois `save`. No desligamento (`terminate/2`, com `trap_exit`):
  `flush`, `sync` e `save_sync` com até `shutdown_save_ms` (padrão 10 000).

  Volta (gate P): `boot` (`(%{map, catalog, mutation_boost} -> {:restored, %{sim, offset_ms,
  epoch, …}} | {:fresh, %{epoch, …}})`, padrão nil = sempre mundo novo). Restaurado: o `Sim`
  da fotografia, reconciliado com o `species_loader` (`Abyss.World.Reconcile`), com o
  relógio e o epoch dela. Novo: o mundo de hoje (espécies do banco com 3 fundadoras), com o
  epoch dado."
  def start_link(opts) do
    {name, opts} = Keyword.pop(opts, :name, __MODULE__)
    gen_opts = if name, do: [name: name], else: []
    GenServer.start_link(__MODULE__, opts, gen_opts)
  end

  @spec snapshot(GenServer.server()) :: map
  def snapshot(server \\ __MODULE__), do: GenServer.call(server, :snapshot)

  @spec stats(GenServer.server()) :: map
  def stats(server \\ __MODULE__), do: GenServer.call(server, :stats)

  @doc "Registra uma espécie criada em tempo de execução; as 3 fundadoras entram no próximo passo."
  @spec add_species(GenServer.server(), Abyss.World.Species.t()) :: :ok
  def add_species(server, sp), do: GenServer.call(server, {:add_species, sp})

  @doc "Relógio do mundo, deslocamento, epoch e tick atuais."
  @spec clock(GenServer.server()) :: %{
          world_ms: integer,
          offset_ms: integer,
          epoch: pos_integer,
          tick: non_neg_integer
        }
  def clock(server \\ __MODULE__), do: GenServer.call(server, :clock)

  # --- Callbacks ---

  @impl true
  def init(opts) do
    persist = Keyword.get(opts, :persist)
    # Com fotografia, o desligamento do supervisor passa por `terminate/2`.
    if persist, do: Process.flag(:trap_exit, true)
    tick_hz = Keyword.fetch!(opts, :tick_hz)
    real_ms = System.system_time(:millisecond)

    map_path =
      Keyword.get_lazy(opts, :map_path, fn -> Application.fetch_env!(:abyss, :map_path) end)

    ctx = %{
      map: WMap.load!(map_path),
      catalog: Keyword.get_lazy(opts, :catalog, &Catalog.get/0),
      mutation_boost: Keyword.get(opts, :mutation_boost, 1.0)
    }

    loader = Keyword.get(opts, :species_loader, fn -> %{live: [], extinct: []} end)

    {sim, offset, epoch} =
      case Keyword.get(opts, :boot) do
        nil ->
          offset = Keyword.get(opts, :clock_offset_ms, 0)

          {fresh_sim(opts, ctx, real_ms - offset, loader.(), offset), offset,
           Keyword.get(opts, :epoch, 1)}

        boot ->
          case boot.(ctx) do
            {:restored, r} ->
              Logger.info(
                "mundo restaurado da fotografia do tick #{r.sim.tick} (epoch #{r.epoch})"
              )

              # Ecologia e comida vêm da configuração de agora (um deploy que muda valores
              # ou acrescenta chaves vale no mundo restaurado); o resto do Sim é o da fotografia.
              sim = %{r.sim | ecology: current_ecology(opts), food_cfg: current_food(opts)}
              {Reconcile.apply(sim, loader.(), r.offset_ms), r.offset_ms, r.epoch}

            {:fresh, f} ->
              {fresh_sim(opts, ctx, real_ms, loader.(), 0), 0, f.epoch}
          end
      end

    state = %{
      sim: sim,
      on_extinct: Keyword.get(opts, :on_extinct, fn _ -> :ok end),
      on_branch: Keyword.get(opts, :on_branch, fn _ -> :ok end),
      on_deaths: Keyword.get(opts, :on_deaths, fn _, _, _, _ -> :ok end),
      offset_ms: offset,
      epoch: epoch,
      persist: persist,
      snapshot_ms: snapshot_ms(Keyword.get(opts, :snapshot_s)),
      shutdown_save_ms: Keyword.get(opts, :shutdown_save_ms, 10_000),
      step: Keyword.get(opts, :step, &Sim.step/3),
      world_id: Base.encode16(:crypto.strong_rand_bytes(16), case: :lower),
      tick_hz: tick_hz,
      broadcast: Keyword.get(opts, :broadcast, fn _ -> :ok end),
      interval_us: 1_000_000 / tick_hz,
      start_us: mono_us(),
      started_ms: real_ms,
      n: 0,
      jitters: [],
      step_us_max: 0,
      snapshot_us_max: 0,
      snapshots: 0
    }

    {:ok, state |> schedule() |> schedule_snapshot()}
  end

  @impl true
  def handle_call(:snapshot, _from, state), do: {:reply, wire_snapshot(state), state}

  def handle_call({:add_species, sp}, _from, state) do
    sp = to_world(sp, state.offset_ms)
    {:reply, :ok, %{state | sim: Sim.add_species(state.sim, sp, founders: 3)}}
  end

  def handle_call(:clock, _from, state) do
    reply = %{
      world_ms: world_ms(state),
      offset_ms: state.offset_ms,
      epoch: state.epoch,
      tick: state.sim.tick
    }

    {:reply, reply, state}
  end

  def handle_call(:stats, _from, state) do
    sorted = Enum.sort(state.jitters)

    reply =
      Sim.food_stats(state.sim)
      |> Map.merge(Sim.eco_stats(state.sim))
      |> Map.merge(%{
        world_id: state.world_id,
        tick: state.sim.tick,
        tick_hz: state.tick_hz,
        population: length(state.sim.organisms),
        uptime_ms: System.system_time(:millisecond) - state.started_ms,
        jitter_ms_p50: percentile(sorted, 0.50),
        jitter_ms_p99: percentile(sorted, 0.99),
        step_us_max: state.step_us_max,
        snapshot_us_max: state.snapshot_us_max,
        snapshots: state.snapshots,
        observers: Observers.count()
      })

    {:reply, reply, state}
  end

  @impl true
  def handle_info(:tick, state) do
    jitter_ms = max(0.0, (mono_us() - due_us(state)) / 1000)
    meta = meta(state)

    {step_us, sim} =
      :timer.tc(fn -> state.step.(state.sim, 1 / state.tick_hz, meta.server_ms) end)

    state.broadcast.(Wire.tick(sim, meta))
    # Extinção antes de ramo no mesmo tick é seguro: um ramo nunca nasce e se extingue no
    # mesmo passo, então nenhuma extinção deste tick se refere a um ramo ainda não gravado.
    ev = sim.life_events
    notify_extinct(state, ev.extinct, Map.get(ev, :extinct_causes, %{}))
    notify_branch(state.on_branch, Enum.map(ev.branches, &to_real(&1, state.offset_ms)))
    notify_deaths(state, Map.get(ev, :dead_by, []), meta.server_ms, sim.tick)

    state = %{
      state
      | sim: sim,
        jitters: Enum.take([jitter_ms | state.jitters], @ring_size),
        step_us_max: max(state.step_us_max, step_us)
    }

    {:noreply, schedule(state)}
  end

  # A cada intervalo: mortes acumuladas primeiro (a fronteira da contagem fica exata),
  # depois a fotografia. Nada aqui espera o banco; uma falha não derruba o mundo.
  # O tempo gasto aqui (`snapshot_us_max` em stats) é o que a fotografia custa ao tick.
  def handle_info(:snapshot, state) do
    {us, :ok} = :timer.tc(fn -> take_snapshot(state) end)

    state = %{
      state
      | snapshot_us_max: max(state.snapshot_us_max, us),
        snapshots: state.snapshots + 1
    }

    {:noreply, schedule_snapshot(state)}
  end

  # Com `trap_exit`, saídas de processos ligados (fora o pai) são ignoradas.
  def handle_info({:EXIT, _pid, _reason}, state), do: {:noreply, state}

  defp take_snapshot(state) do
    state.persist.flush.()

    if state.persist.save.(payload(state)) == :busy,
      do: Logger.warning("fotografia do tick #{state.sim.tick} descartada: gravação em curso")

    :ok
  catch
    kind, _ ->
      Logger.error("fotografia do tick #{state.sim.tick} falhou (#{kind})")
      :ok
  end

  @impl true
  # Só no desligamento normal: uma queda do próprio mundo não vira a fotografia mais nova,
  # senão a volta repetiria o mesmo passo que derrubou o processo.
  def terminate(reason, %{persist: %{} = persist} = state)
      when reason in [:normal, :shutdown] or
             (is_tuple(reason) and tuple_size(reason) == 2 and elem(reason, 0) == :shutdown) do
    persist.flush.()
    persist.sync.()

    case persist.save_sync.(payload(state), state.shutdown_save_ms) do
      :ok -> Logger.info("fotografia de desligamento gravada no tick #{state.sim.tick}")
      _ -> Logger.error("fotografia de desligamento falhou no tick #{state.sim.tick}")
    end
  catch
    kind, _ -> Logger.error("fotografia de desligamento falhou (#{kind})")
  end

  def terminate(_reason, _state), do: :ok

  # --- Internos ---

  defp current_food(opts) do
    Keyword.get_lazy(opts, :food, fn -> Application.fetch_env!(:abyss, :food) end)
    |> Map.new()
    |> Sim.boost_food(Keyword.get(opts, :food_boost, 1.0))
  end

  defp current_ecology(opts) do
    Keyword.get_lazy(opts, :ecology, fn -> Application.fetch_env!(:abyss, :ecology) end)
    |> Map.new()
  end

  # Mundo novo: espécies do banco vivas com 3 fundadoras e extintas sem organismos.
  defp fresh_sim(opts, ctx, now_ms, loaded, offset) do
    sim =
      Sim.new(%{
        population: Keyword.fetch!(opts, :population),
        seed: Keyword.get(opts, :seed) || :rand.uniform(2_000_000_000),
        now_ms: now_ms,
        map: ctx.map,
        creature_scale: Keyword.get(opts, :creature_scale, 0.5),
        test_species: Keyword.get(opts, :test_species, true),
        food: current_food(opts),
        ecology: current_ecology(opts),
        catalog: ctx.catalog,
        mutation_boost: ctx.mutation_boost
      })

    sim = Enum.reduce(loaded.live, sim, &Sim.add_species(&2, to_world(&1, offset), founders: 3))

    sim =
      Enum.reduce(loaded.extinct, sim, fn {sp, ms}, acc ->
        Sim.add_species(acc, to_world(sp, offset), founders: 0, extinct_ms: ms - offset)
      end)

    # Contadores de ramos não carregados: id de ramo nunca é reaproveitado.
    Sim.reserve_branch_seq(sim, Map.get(loaded, :branch_seq, %{}))
  end

  # Só espécies criadas (id string); uma falha do callback não derruba o mundo.
  defp notify_extinct(state, extinct, causes) do
    created =
      for {id, ms} <- extinct, is_binary(id) do
        {cause, predator} = Map.get(causes, id, {nil, nil})

        %{
          id: id,
          at_ms: ms + state.offset_ms,
          world_ms: ms,
          epoch: state.epoch,
          cause: cause,
          predator: predator
        }
      end

    case created do
      [] ->
        :ok

      created ->
        try do
          state.on_extinct.(created)
        rescue
          e ->
            ids = Enum.map_join(created, ",", & &1.id)
            Logger.error("on_extinct falhou (#{inspect(e.__struct__)}) para #{ids}")
        end
    end
  end

  # Mortes de criadas do passo; uma falha do callback não derruba o mundo.
  defp notify_deaths(state, dead_by, world_ms, tick) do
    case for({sp, _, _} = d <- dead_by, is_binary(sp), do: d) do
      [] ->
        :ok

      created ->
        try do
          state.on_deaths.(created, world_ms, tick, state.epoch)
        rescue
          e -> Logger.error("on_deaths falhou (#{inspect(e.__struct__)}) no tick #{tick}")
        end
    end
  end

  # `born_ms` de espécie: hora real fora do Server, relógio do mundo dentro do Sim.
  defp to_world(sp, offset), do: shift_born(sp, -offset)
  defp to_real(sp, offset), do: shift_born(sp, offset)

  defp shift_born(%{born_ms: ms} = sp, d) when is_integer(ms), do: %{sp | born_ms: ms + d}
  defp shift_born(sp, _d), do: sp

  defp world_ms(state), do: System.system_time(:millisecond) - state.offset_ms

  # Ramos novos; uma falha do callback não derruba o mundo.
  defp notify_branch(_callback, []), do: :ok

  defp notify_branch(callback, branches) do
    callback.(branches)
  rescue
    e ->
      ids = Enum.map_join(branches, ",", &to_string(&1.id))
      Logger.error("on_branch falhou (#{inspect(e.__struct__)}) para #{ids}")
  end

  defp payload(state) do
    %{
      sim: state.sim,
      epoch: state.epoch,
      world_ms: state.sim.now_ms,
      saved_at: DateTime.utc_now()
    }
  end

  defp snapshot_ms(nil), do: nil
  defp snapshot_ms(s) when is_number(s) and s > 0, do: round(s * 1000)

  defp schedule_snapshot(%{persist: %{}, snapshot_ms: ms} = state) when is_integer(ms) do
    Process.send_after(self(), :snapshot, ms)
    state
  end

  defp schedule_snapshot(state), do: state

  # Agenda o tick n+1 contra o relógio de partida (sem acumular deriva).
  defp schedule(state) do
    state = %{state | n: state.n + 1}
    delay_ms = max(0, ceil((due_us(state) - mono_us()) / 1000))
    Process.send_after(self(), :tick, delay_ms, [])
    state
  end

  defp due_us(state), do: state.start_us + state.n * state.interval_us

  defp mono_us, do: System.monotonic_time(:microsecond)

  defp meta(state) do
    %{
      world_id: state.world_id,
      tick_hz: state.tick_hz,
      server_ms: world_ms(state),
      offset_ms: state.offset_ms
    }
  end

  defp wire_snapshot(state), do: Wire.snapshot(state.sim, meta(state))

  defp percentile([], _p), do: 0.0

  defp percentile(sorted, p) do
    idx = min(length(sorted) - 1, trunc(Float.ceil(p * length(sorted))) - 1) |> max(0)
    Enum.at(sorted, idx)
  end
end
