defmodule AbyssWeb.WorldChannel do
  @moduledoc "Canal de observação (somente leitura). Os ticks chegam por fastlane do endpoint."

  use Phoenix.Channel

  alias Abyss.World.{Observers, Server}

  @impl true
  def join("world:main", _params, socket) do
    Observers.track(self())
    {:ok, Server.snapshot(), socket}
  end

  def join(_topic, _params, _socket), do: {:error, %{reason: "unknown_world"}}

  @impl true
  def handle_in(_event, _payload, socket) do
    {:reply, {:error, %{reason: "read_only"}}, socket}
  end
end
