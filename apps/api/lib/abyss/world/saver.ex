defmodule Abyss.World.Saver do
  @moduledoc """
  Grava fotografias do mundo em `world_snapshots` sem atrasar o tick: `save/2` só aceita
  o pedido e a codificação e a escrita correm num processo próprio. Uma gravação por vez:
  se uma está em andamento, o pedido seguinte devolve `:busy` e é descartado. Depois de
  gravar, ficam só as 3 mais novas. Erros vão para o log só com o tick.
  """

  use GenServer

  import Ecto.Query

  alias Abyss.Repo
  alias Abyss.World.{Snapshot, SnapshotRecord}

  require Logger

  @keep 3

  @type payload :: %{
          sim: Abyss.World.Sim.t(),
          epoch: pos_integer,
          world_ms: integer,
          saved_at: DateTime.t()
        }

  @doc "opts: `name` (padrão o módulo; nil = anônimo) e `writer` (`(payload -> any)`, padrão `write/1`; injeção para testes)."
  def start_link(opts \\ []) do
    {name, opts} = Keyword.pop(opts, :name, __MODULE__)
    gen_opts = if name, do: [name: name], else: []
    GenServer.start_link(__MODULE__, opts, gen_opts)
  end

  @doc "Pede uma gravação; `:busy` (descartada) se outra está em andamento."
  @spec save(GenServer.server(), payload) :: :ok | :busy
  def save(server \\ __MODULE__, payload), do: GenServer.call(server, {:save, payload})

  @doc "Grava agora e espera (desligamento), até `timeout` ms."
  @spec save_sync(GenServer.server(), payload, timeout) :: :ok | {:error, term}
  def save_sync(server \\ __MODULE__, payload, timeout) do
    GenServer.call(server, {:save_sync, payload}, timeout)
  catch
    :exit, reason -> {:error, reason}
  end

  @doc "As `n` fotografias mais novas (maior id primeiro)."
  @spec latest(pos_integer) :: [SnapshotRecord.t()]
  def latest(n \\ @keep) do
    Repo.all(from(s in SnapshotRecord, order_by: [desc: s.id], limit: ^n), log: false)
  end

  @doc "Escritor padrão: codifica, grava e apaga as que passam de #{@keep}."
  @spec write(payload) :: :ok
  def write(%{sim: sim} = p) do
    data = Snapshot.encode(sim)

    Repo.insert!(
      %SnapshotRecord{
        epoch: p.epoch,
        tick: sim.tick,
        world_ms: p.world_ms,
        saved_at: p.saved_at,
        format_version: Snapshot.format_version(),
        rules_version: Snapshot.rules_version(),
        checksum: Snapshot.checksum(data),
        data: data
      },
      log: false
    )

    keep = from(s in SnapshotRecord, order_by: [desc: s.id], limit: @keep, select: s.id)
    Repo.delete_all(from(s in SnapshotRecord, where: s.id not in subquery(keep)), log: false)
    :ok
  end

  # --- Callbacks ---

  @impl true
  def init(opts) do
    {:ok, %{busy: false, writer: Keyword.get(opts, :writer, &write/1)}}
  end

  @impl true
  def handle_call({:save, _payload}, _from, %{busy: true} = state), do: {:reply, :busy, state}

  def handle_call({:save, payload}, _from, state) do
    writer = state.writer
    spawn_monitor(fn -> run(writer, payload) end)
    {:reply, :ok, %{state | busy: true}}
  end

  def handle_call({:save_sync, payload}, _from, state) do
    {:reply, run(state.writer, payload), state}
  end

  @impl true
  def handle_info({:DOWN, _ref, :process, _pid, _reason}, state),
    do: {:noreply, %{state | busy: false}}

  defp run(writer, %{sim: sim} = payload) do
    writer.(payload)
    :ok
  rescue
    e ->
      Logger.error("gravar fotografia do tick #{sim.tick} falhou (#{inspect(e.__struct__)})")
      {:error, e.__struct__}
  end
end
