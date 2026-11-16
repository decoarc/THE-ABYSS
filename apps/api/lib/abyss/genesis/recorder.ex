defmodule Abyss.Genesis.Recorder do
  @moduledoc """
  Grava no banco a extinção de espécies criadas (com causa), o nascimento/extinção de
  ramos e as mortes por intervalo (`death_counts`). `record/1`, `record_branches/1`,
  `record_deaths/4` e `flush_deaths/0` são casts: o tick do mundo nunca espera o banco.
  Os logs de erro levam só ids (nunca e-mail).
  """

  use GenServer

  import Ecto.Query

  alias Abyss.Genesis.{BranchRecord, DeathCount, SpeciesRecord}
  alias Abyss.Repo

  require Logger

  def start_link(opts) when is_list(opts),
    do: GenServer.start_link(__MODULE__, :ok, Keyword.put_new(opts, :name, __MODULE__))

  @flush_every_ms 10_000

  @typedoc "Extinção de espécie criada; `at_ms` em hora real, `world_ms` no relógio do mundo."
  @type extinction :: %{
          required(:id) => String.t(),
          required(:at_ms) => integer,
          optional(:world_ms) => integer,
          optional(:epoch) => pos_integer,
          optional(:cause) => atom | nil,
          optional(:predator) => String.t() | atom | nil
        }

  @spec record([extinction]) :: :ok
  def record(extinct), do: GenServer.cast(__MODULE__, {:record, extinct})

  @doc """
  Acumula mortes de criadas (`[{species_id, causa, predador | nil}]`) no intervalo de
  5 min de `world_ms`; vai para o banco em `flush_deaths/0` (a cada 10 s, no `sync`, antes
  de cada extinção e antes de cada fotografia).
  """
  @spec record_deaths(
          [{String.t(), atom, String.t() | atom | nil}],
          integer,
          integer,
          pos_integer
        ) ::
          :ok
  def record_deaths(dead_by, world_ms, tick, epoch),
    do: GenServer.cast(__MODULE__, {:deaths, dead_by, world_ms, tick, epoch})

  @doc "Insere as mortes acumuladas (uma linha por chave) e zera o acumulado."
  @spec flush_deaths() :: :ok
  def flush_deaths, do: GenServer.cast(__MODULE__, :flush_deaths)

  @doc "Grava o nascimento de ramos (idempotente: id repetido não duplica)."
  @spec record_branches([Abyss.World.Species.t()]) :: :ok
  def record_branches(branches), do: GenServer.cast(__MODULE__, {:record_branches, branches})

  @doc """
  Espera o Recorder gravar tudo o que já está na fila (os casts são processados em
  ordem). Usado no boot das espécies: se só o `World.Server` reiniciar, o boot não lê
  o banco antes de um ramo ou uma extinção ainda na fila. Sem Recorder vivo (ou se ele
  não responder a tempo), segue sem esperar.
  """
  @spec sync(timeout) :: :ok
  def sync(timeout \\ 15_000) do
    if Process.whereis(__MODULE__) do
      try do
        GenServer.call(__MODULE__, :sync, timeout)
      catch
        :exit, _ ->
          Logger.error("Recorder.sync sem resposta; boot segue com o banco como está")
          :ok
      end
    else
      :ok
    end
  end

  @impl true
  def init(:ok) do
    Process.send_after(self(), :flush_deaths, @flush_every_ms)
    {:ok, %{deaths: %{}}}
  end

  @impl true
  def handle_call(:sync, _from, state), do: {:reply, :ok, flush(state)}

  @impl true
  def handle_info(:flush_deaths, state) do
    Process.send_after(self(), :flush_deaths, @flush_every_ms)
    {:noreply, flush(state)}
  end

  @impl true
  def handle_cast({:deaths, dead_by, world_ms, tick, epoch}, state) do
    bucket = DeathCount.bucket(world_ms)

    deaths =
      Enum.reduce(dead_by, state.deaths, fn {sp, cause, pred}, acc ->
        key = {to_string(sp), epoch, bucket, Atom.to_string(cause), pred && to_string(pred)}
        Map.update(acc, key, {1, tick}, fn {n, t} -> {n + 1, max(t, tick)} end)
      end)

    {:noreply, %{state | deaths: deaths}}
  end

  def handle_cast(:flush_deaths, state), do: {:noreply, flush(state)}

  def handle_cast({:record, extinct}, state) do
    # A reta final desta extinção entra no banco antes da própria extinção.
    state = flush(state)

    for %{id: id, at_ms: ms} = ev <- extinct, is_binary(id), is_integer(ms) do
      try do
        set = [
          extinct_at: DateTime.from_unix!(ms * 1000, :microsecond),
          extinct_cause: ev[:cause] && Atom.to_string(ev[:cause]),
          extinct_predator_id: ev[:predator] && to_string(ev[:predator]),
          extinct_world_ms: ev[:world_ms],
          extinct_epoch: ev[:epoch]
        ]

        case String.split(id, ".", parts: 2) do
          [_root] ->
            if db_id = parse_id(id) do
              Repo.update_all(
                from(s in SpeciesRecord, where: s.id == ^db_id and is_nil(s.extinct_at)),
                [set: set],
                log: false
              )
            end

          [_root, _] ->
            Repo.update_all(
              from(b in BranchRecord, where: b.id == ^id and is_nil(b.extinct_at)),
              [set: set],
              log: false
            )
        end
      rescue
        e -> Logger.error("gravar extinção falhou (#{inspect(e.__struct__)}) para #{id}")
      end
    end

    {:noreply, state}
  end

  def handle_cast({:record_branches, branches}, state) do
    for sp <- branches do
      try do
        Repo.insert!(
          %BranchRecord{
            id: sp.id,
            root_species_id: parse_id(sp.root),
            parent_id: sp.parent,
            name: sp.name,
            code: sp.code,
            blueprint: sp.blueprint,
            region: sp.region,
            born_at: DateTime.from_unix!(sp.born_ms * 1000, :microsecond)
          },
          on_conflict: :nothing,
          conflict_target: :id,
          log: false
        )

        warn_if_other_blueprint(sp)
      rescue
        e -> Logger.error("gravar ramo falhou (#{inspect(e.__struct__)}) para #{inspect(sp.id)}")
      end
    end

    {:noreply, state}
  end

  # Id já gravado com outra planta: o `on_conflict` manteve a linha antiga (id de ramo
  # nunca deveria repetir; ver `branch_seq`). Fica registrado, só com o id.
  defp warn_if_other_blueprint(sp) do
    case Repo.get(BranchRecord, sp.id, log: false) do
      %BranchRecord{blueprint: bp} when bp != sp.blueprint ->
        Logger.warning("ramo #{inspect(sp.id)} já gravado com outra planta; mantida a do banco")

      _ ->
        :ok
    end
  end

  # Uma linha por chave; em erro do banco, registra só a quantidade e descarta (o tick
  # nunca espera, e o acumulado não cresce sem limite).
  defp flush(%{deaths: deaths} = state) when map_size(deaths) == 0, do: state

  defp flush(%{deaths: deaths} = state) do
    rows =
      for {{sp, epoch, bucket, cause, pred}, {n, tick}} <- deaths do
        %{
          species_id: sp,
          epoch: epoch,
          bucket_ms: bucket,
          cause: cause,
          predator_id: pred,
          n: n,
          tick: tick
        }
      end

    try do
      Repo.insert_all(DeathCount, rows, log: false)
    rescue
      e ->
        Logger.error(
          "gravar mortes falhou (#{inspect(e.__struct__)}); #{length(rows)} linhas perdidas"
        )
    end

    %{state | deaths: %{}}
  end

  defp parse_id("sp" <> n) do
    case Integer.parse(n) do
      {i, ""} when i > 0 -> i
      _ -> nil
    end
  end

  defp parse_id(_), do: nil
end
