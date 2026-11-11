defmodule Abyss.Genesis.Recorder do
  @moduledoc """
  Grava no banco a extinção de espécies criadas. `record/1` é um cast: o tick
  do mundo nunca espera o banco.
  """

  use GenServer

  import Ecto.Query

  alias Abyss.Genesis.SpeciesRecord
  alias Abyss.Repo

  require Logger

  def start_link(opts) when is_list(opts),
    do: GenServer.start_link(__MODULE__, :ok, Keyword.put_new(opts, :name, __MODULE__))

  @spec record([{String.t(), integer}]) :: :ok
  def record(extinct), do: GenServer.cast(__MODULE__, {:record, extinct})

  @impl true
  def init(:ok), do: {:ok, %{}}

  @impl true
  def handle_cast({:record, extinct}, state) do
    for {id, ms} <- extinct, db_id = parse_id(id), is_integer(ms) do
      try do
        Repo.update_all(
          from(s in SpeciesRecord, where: s.id == ^db_id and is_nil(s.extinct_at)),
          set: [extinct_at: DateTime.from_unix!(ms * 1000, :microsecond)]
        )
      rescue
        e -> Logger.error("gravar extinção falhou (#{inspect(e.__struct__)}) para #{id}")
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
