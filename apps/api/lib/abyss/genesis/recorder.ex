defmodule Abyss.Genesis.Recorder do
  @moduledoc """
  Grava no banco a extinção de espécies criadas e o nascimento/extinção de ramos.
  `record/1` e `record_branches/1` são casts: o tick do mundo nunca espera o banco.
  Os logs de erro levam só ids (nunca e-mail).
  """

  use GenServer

  import Ecto.Query

  alias Abyss.Genesis.{BranchRecord, SpeciesRecord}
  alias Abyss.Repo

  require Logger

  def start_link(opts) when is_list(opts),
    do: GenServer.start_link(__MODULE__, :ok, Keyword.put_new(opts, :name, __MODULE__))

  @spec record([{String.t(), integer}]) :: :ok
  def record(extinct), do: GenServer.cast(__MODULE__, {:record, extinct})

  @doc "Grava o nascimento de ramos (idempotente: id repetido não duplica)."
  @spec record_branches([Abyss.World.Species.t()]) :: :ok
  def record_branches(branches), do: GenServer.cast(__MODULE__, {:record_branches, branches})

  @impl true
  def init(:ok), do: {:ok, %{}}

  @impl true
  def handle_cast({:record, extinct}, state) do
    for {id, ms} <- extinct, is_binary(id), is_integer(ms) do
      try do
        at = DateTime.from_unix!(ms * 1000, :microsecond)

        case String.split(id, ".", parts: 2) do
          [_root] ->
            if db_id = parse_id(id) do
              Repo.update_all(
                from(s in SpeciesRecord, where: s.id == ^db_id and is_nil(s.extinct_at)),
                [set: [extinct_at: at]],
                log: false
              )
            end

          [_root, _] ->
            Repo.update_all(
              from(b in BranchRecord, where: b.id == ^id and is_nil(b.extinct_at)),
              [set: [extinct_at: at]],
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
          log: false
        )
      rescue
        e -> Logger.error("gravar ramo falhou (#{inspect(e.__struct__)}) para #{inspect(sp.id)}")
      end
    end

    {:noreply, state}
  end

  defp parse_id("sp" <> n) do
    case Integer.parse(n) do
      {i, ""} when i > 0 -> i
      _ -> nil
    end
  end

  defp parse_id(_), do: nil
end
