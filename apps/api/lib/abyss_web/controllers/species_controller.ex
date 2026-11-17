defmodule AbyssWeb.SpeciesController do
  use AbyssWeb, :controller

  alias Abyss.Genesis.RateLimit
  alias Abyss.History

  def search(conn, params) do
    limit =
      Application.fetch_env!(:abyss, :genesis)
      |> Keyword.fetch!(:limits)
      |> Keyword.fetch!(:search_ip)

    case RateLimit.hit({:search_ip, conn.remote_ip}, limit) do
      :ok -> json(conn, %{results: History.search(Map.get(params, "q", ""))})
      :limited -> conn |> put_status(429) |> json(%{status: "slow_down"})
    end
  end

  def history(conn, %{"root_id" => root_id}) do
    case History.tree(root_id) do
      {:ok, tree} -> json(conn, tree)
      :not_found -> conn |> put_status(404) |> json(%{status: "not_found"})
    end
  end
end
