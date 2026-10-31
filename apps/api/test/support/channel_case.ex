defmodule AbyssWeb.ChannelCase do
  @moduledoc "Case template para testes de canal."

  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest
      import AbyssWeb.ChannelCase

      @endpoint AbyssWeb.Endpoint
    end
  end
end
