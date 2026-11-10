defmodule AbyssWeb.GenesisController do
  use AbyssWeb, :controller

  alias Abyss.Genesis

  def submit(conn, params) do
    case Genesis.submit(params, conn.remote_ip) do
      {:ok, :sent} ->
        conn |> put_status(202) |> json(%{status: "sent"})

      {:error, :rate_limited} ->
        conn |> put_status(429) |> json(%{status: "slow_down"})

      {:error, errors} when is_map(errors) ->
        conn |> put_status(422) |> json(%{status: "invalid", errors: errors})
    end
  end

  def confirm(conn, params) do
    case Genesis.confirm(params["token"], ip: conn.remote_ip) do
      {:ok, %{id: id, name: name, code: code}} ->
        json(conn, %{status: "published", species: %{id: id, name: name, code: code}})

      {:error, :invalid} ->
        json(conn, %{status: "invalid"})

      {:error, :taken} ->
        json(conn, %{status: "taken"})

      {:error, :rate_limited} ->
        conn |> put_status(429) |> json(%{status: "slow_down"})
    end
  end

  def catalog(conn, _params) do
    body = :abyss |> Application.fetch_env!(:catalog_path) |> File.read!()

    conn
    |> put_resp_content_type("application/json")
    |> send_resp(200, body)
  end
end
