defmodule Abyss.World.Server do
  @moduledoc """
  Único processo dono do mundo. Avança o `Sim` puro em cadência fixa, sem
  deriva (cada disparo é agendado contra o relógio monotônico de partida),
  transmite cada tick e mede jitter.
  """

  use GenServer

  alias Abyss.World.Map, as: WMap
  alias Abyss.World.{Observers, Sim, Wire}

  require Logger

  @ring_size 600

  # --- API ---

  @doc "opts: população/seed/tick_hz, `creature_scale`, `test_species`, `food_boost` (medição), `map_path` (padrão: config :map_path), `name` (nil = anônimo), `broadcast`, `species_loader` (`(-> %{live: [Species.t], extinct: [{Species.t, ms}]})`, chamado no init) e `on_extinct` (`([{String.t, ms}] -> any)`, extinções de espécies criadas após cada passo)."
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

  # --- Callbacks ---

  @impl true
  def init(opts) do
    tick_hz = Keyword.fetch!(opts, :tick_hz)
    seed = Keyword.get(opts, :seed) || :rand.uniform(2_000_000_000)
    now_ms = System.system_time(:millisecond)

    map_path =
      Keyword.get_lazy(opts, :map_path, fn -> Application.fetch_env!(:abyss, :map_path) end)

    map = WMap.load!(map_path)

    sim =
      Sim.new(%{
        population: Keyword.fetch!(opts, :population),
        seed: seed,
        now_ms: now_ms,
        map: map,
        creature_scale: Keyword.get(opts, :creature_scale, 0.5),
        test_species: Keyword.get(opts, :test_species, true),
        food:
          Keyword.get_lazy(opts, :food, fn -> Application.fetch_env!(:abyss, :food) end)
          |> Map.new()
          |> Sim.boost_food(Keyword.get(opts, :food_boost, 1.0)),
        ecology:
          Keyword.get_lazy(opts, :ecology, fn -> Application.fetch_env!(:abyss, :ecology) end)
          |> Map.new()
      })

    loader = Keyword.get(opts, :species_loader, fn -> %{live: [], extinct: []} end)
    %{live: live, extinct: extinct} = loader.()
    sim = Enum.reduce(live, sim, &Sim.add_species(&2, &1, founders: 3))

    sim =
      Enum.reduce(extinct, sim, fn {sp, ms}, acc ->
        Sim.add_species(acc, sp, founders: 0, extinct_ms: ms)
      end)

    state = %{
      sim: sim,
      on_extinct: Keyword.get(opts, :on_extinct, fn _ -> :ok end),
      world_id: Base.encode16(:crypto.strong_rand_bytes(16), case: :lower),
      tick_hz: tick_hz,
      broadcast: Keyword.get(opts, :broadcast, fn _ -> :ok end),
      interval_us: 1_000_000 / tick_hz,
      start_us: mono_us(),
      started_ms: now_ms,
      n: 0,
      jitters: [],
      step_us_max: 0
    }

    {:ok, schedule(state)}
  end

  @impl true
  def handle_call(:snapshot, _from, state), do: {:reply, wire_snapshot(state), state}

  def handle_call({:add_species, sp}, _from, state) do
    {:reply, :ok, %{state | sim: Sim.add_species(state.sim, sp, founders: 3)}}
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
        observers: Observers.count()
      })

    {:reply, reply, state}
  end

  @impl true
  def handle_info(:tick, state) do
    jitter_ms = max(0.0, (mono_us() - due_us(state)) / 1000)
    meta = meta(state)
    {step_us, sim} = :timer.tc(fn -> Sim.step(state.sim, 1 / state.tick_hz, meta.server_ms) end)

    state.broadcast.(Wire.tick(sim, meta))
    notify_extinct(state.on_extinct, sim.life_events.extinct)

    state = %{
      state
      | sim: sim,
        jitters: Enum.take([jitter_ms | state.jitters], @ring_size),
        step_us_max: max(state.step_us_max, step_us)
    }

    {:noreply, schedule(state)}
  end

  # --- Internos ---

  # Só espécies criadas (id string); uma falha do callback não derruba o mundo.
  defp notify_extinct(callback, extinct) do
    case for({id, ms} <- extinct, is_binary(id), do: {id, ms}) do
      [] ->
        :ok

      created ->
        try do
          callback.(created)
        rescue
          e ->
            ids = Enum.map_join(created, ",", &elem(&1, 0))
            Logger.error("on_extinct falhou (#{inspect(e.__struct__)}) para #{ids}")
        end
    end
  end

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
      server_ms: System.system_time(:millisecond)
    }
  end

  defp wire_snapshot(state), do: Wire.snapshot(state.sim, meta(state))

  defp percentile([], _p), do: 0.0

  defp percentile(sorted, p) do
    idx = min(length(sorted) - 1, trunc(Float.ceil(p * length(sorted))) - 1) |> max(0)
    Enum.at(sorted, idx)
  end
end
