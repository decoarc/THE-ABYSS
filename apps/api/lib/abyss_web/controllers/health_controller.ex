defmodule AbyssWeb.HealthController do
  use AbyssWeb, :controller

  def show(conn, _params) do
    json(conn, %{ok: true})
  end
end
