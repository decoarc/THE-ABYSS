defmodule AbyssWeb.WorldSocket do
  @moduledoc "Socket público e anônimo: qualquer cliente pode observar o mundo."

  use Phoenix.Socket

  channel "world:*", AbyssWeb.WorldChannel

  @impl true
  def connect(_params, socket, _connect_info), do: {:ok, socket}

  @impl true
  def id(_socket), do: nil
end
