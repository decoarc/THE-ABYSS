defmodule AbyssWeb.Plugs.Cors do
  @moduledoc """
  CORS para o cliente web: só as origens de `config :abyss, :web_origins` ganham
  os headers. O preflight (OPTIONS) responde 204 e encerra, sem tocar no resto.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    conn = allow_origin(conn)

    if conn.method == "OPTIONS" do
      conn |> send_resp(204, "") |> halt()
    else
      conn
    end
  end

  defp allow_origin(conn) do
    origins = Application.get_env(:abyss, :web_origins, [])

    case get_req_header(conn, "origin") do
      [origin] ->
        if origin in origins do
          conn
          |> put_resp_header("access-control-allow-origin", origin)
          |> put_resp_header("vary", "origin")
          |> put_resp_header("access-control-allow-methods", "GET, POST, OPTIONS")
          |> put_resp_header("access-control-allow-headers", "content-type")
        else
          conn
        end

      _ ->
        conn
    end
  end
end
