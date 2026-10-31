defmodule AbyssWeb.StatsController do
  use AbyssWeb, :controller

  def show(conn, _params), do: json(conn, Abyss.World.Server.stats())
end
