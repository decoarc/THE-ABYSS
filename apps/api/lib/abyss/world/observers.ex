defmodule Abyss.World.Observers do
  @moduledoc "Conta observadores conectados; esquece pids que morrem."

  use GenServer

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, :ok, Keyword.put_new(opts, :name, __MODULE__))
  end

  @spec track(pid) :: :ok
  def track(pid, server \\ __MODULE__), do: GenServer.call(server, {:track, pid})

  @spec count() :: non_neg_integer
  def count(server \\ __MODULE__), do: GenServer.call(server, :count)

  @impl true
  def init(:ok), do: {:ok, %{}}

  @impl true
  def handle_call({:track, pid}, _from, refs) do
    refs =
      if Map.has_key?(refs, pid), do: refs, else: Map.put(refs, pid, Process.monitor(pid))

    {:reply, :ok, refs}
  end

  def handle_call(:count, _from, refs), do: {:reply, map_size(refs), refs}

  @impl true
  def handle_info({:DOWN, _ref, :process, pid, _reason}, refs) do
    {:noreply, Map.delete(refs, pid)}
  end
end
