defmodule Abyss.World.Server do
  @moduledoc """
  Único processo dono do mundo. Avança o `Sim` puro em cadência fixa, sem
  deriva (cada disparo é agendado contra o relógio monotônico de partida),
  transmite cada tick e mede jitter.
  """

  use GenServer

  alias Abyss.World.Map, as: WMap
  alias Abyss.World.{Observers, Sim, Wire}

  @ring_size 600

  # --- API ---

  @doc "opts: população/seed/tick_hz, `creature_scale`, `test_species`, `map_path` (padrão: config :map_path), `name` (nil = anônimo), `broadcast`."
  def start_link(opts) do
    {name, opts} = Keyword.pop(opts, :name, __MODULE__)
    gen_opts = if name, do: [name: name], else: []
    GenServer.start_link(__MODULE__, opts, gen_opts)
  end

  @spec snapshot(GenServer.server()) :: map
  def snapshot(server \\ __MODULE__), do: GenServer.call(server, :snapshot)

  @spec stats(GenServer.server()) :: map
  def stats(server \\ __MODULE__), do: GenServer.call(server, :stats)

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
        test_species: Keyword.get(opts, :test_species, true)
      })

    state = %{
      sim: sim,
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

  def handle_call(:stats, _from, state) do
    sorted = Enum.sort(state.jitters)

    reply = %{
      world_id: state.world_id,
      tick: state.sim.tick,
      tick_hz: state.tick_hz,
      population: length(state.sim.organisms),
      uptime_ms: System.system_time(:millisecond) - state.started_ms,
      jitter_ms_p50: percentile(sorted, 0.50),
      jitter_ms_p99: percentile(sorted, 0.99),
      step_us_max: state.step_us_max,
      observers: Observers.count()
    }

    {:reply, reply, state}
  end

  @impl true
  def handle_info(:tick, state) do
    jitter_ms = max(0.0, (mono_us() - due_us(state)) / 1000)
    {step_us, sim} = :timer.tc(fn -> Sim.step(state.sim, 1 / state.tick_hz) end)

    meta = meta(state)
    state.broadcast.(Wire.tick(sim, meta))

    state = %{
      state
      | sim: sim,
        jitters: Enum.take([jitter_ms | state.jitters], @ring_size),
        step_us_max: max(state.step_us_max, step_us)
    }

    {:noreply, schedule(state)}
  end

  # --- Internos ---

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
