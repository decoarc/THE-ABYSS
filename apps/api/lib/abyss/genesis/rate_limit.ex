defmodule Abyss.Genesis.RateLimit do
  @moduledoc """
  Limite de taxa por janela fixa, em ETS pública. O GenServer é dono da tabela
  e varre as janelas vencidas. O relógio (`now_s`) é injetável nos testes.
  """

  use GenServer

  @table __MODULE__
  @sweep_ms 60_000

  def start_link(_opts \\ []), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @spec hit(term, {pos_integer, pos_integer}, integer) :: :ok | :limited
  def hit(key, {max, window_s}, now_s \\ System.system_time(:second)) do
    window = div(now_s, window_s)
    expires = (window + 1) * window_s

    count = :ets.update_counter(@table, {key, window}, {2, 1}, {{key, window}, 0, expires})

    if count > max, do: :limited, else: :ok
  end

  @spec reset() :: :ok
  def reset do
    :ets.delete_all_objects(@table)
    :ok
  end

  @impl true
  def init(nil) do
    :ets.new(@table, [:named_table, :public, :set, write_concurrency: true])
    Process.send_after(self(), :sweep, @sweep_ms)
    {:ok, nil}
  end

  @impl true
  def handle_info(:sweep, state) do
    now = System.system_time(:second)
    :ets.select_delete(@table, [{{:_, :_, :"$1"}, [{:<, :"$1", now}], [true]}])
    Process.send_after(self(), :sweep, @sweep_ms)
    {:noreply, state}
  end
end
