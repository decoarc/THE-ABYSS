defmodule AbyssWeb.GenesisControllerTest do
  use AbyssWeb.ConnCase, async: false

  import ExUnit.CaptureLog

  alias Abyss.Genesis.{RateLimit, SpeciesRecord, VerificationToken}
  alias Abyss.Repo

  @email "Ana.Secreta@Exemplo.com"
  @normalized "ana.secreta@exemplo.com"

  setup do
    RateLimit.reset()
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})

    start_supervised!(
      {Abyss.World.Server,
       population: 5, test_species: false, tick_hz: 20, seed: 1, broadcast: fn _ -> :ok end}
    )

    :ok
  end

  defp part(kind) do
    %{
      "kind" => kind,
      "at" => 0.5,
      "around" => 0.0,
      "size" => 1.0,
      "angle" => 0.0,
      "mirror" => false
    }
  end

  defp blueprint do
    %{
      "v" => 1,
      "body" => %{"spine" => [[-0.3, 0.0, 0.35], [0.0, 0.0, 0.45], [0.3, 0.0, 0.35]]},
      "parts" => [part("raspador")],
      "colors" => %{"glow" => "#7fe9dd", "body" => "#3f5a4a"},
      "pattern" => "manchas"
    }
  end

  defp payload, do: payload(@email)

  defp payload(email),
    do: %{"email" => email, "name" => "Lumina", "blueprint" => blueprint()}

  defp token_from_mailbox do
    receive do
      {:email, email} ->
        [_, token] = Regex.run(~r{#confirmar=([A-Za-z0-9_-]+)}, email.text_body)
        token
    after
      500 -> flunk("nenhum e-mail")
    end
  end

  test "submit válido responde 202 e genérico", %{conn: conn} do
    conn1 = post(conn, "/api/genesis/submit", payload())
    assert response(conn1, 202) == ~s({"status":"sent"})
    token = token_from_mailbox()

    assert %{"status" => "published"} =
             json_response(post(build_conn(), "/api/genesis/confirm", %{"token" => token}), 200)

    # e-mail já usado: mesma resposta
    conn2 = post(build_conn(), "/api/genesis/submit", payload())
    assert response(conn2, 202) == ~s({"status":"sent"})
  end

  test "422 não ecoa o e-mail", %{conn: conn} do
    bad = %{"email" => "isto@@nao-vale", "name" => "x", "blueprint" => %{}}
    conn = post(conn, "/api/genesis/submit", bad)
    body = response(conn, 422)
    assert %{"status" => "invalid", "errors" => %{"email" => _}} = Jason.decode!(body)
    refute body =~ "isto@@nao-vale"
  end

  test "429 quando o limite estoura", %{conn: conn} do
    for _ <- 1..10, do: post(build_conn(), "/api/genesis/submit", %{})

    assert json_response(post(conn, "/api/genesis/submit", %{}), 429) == %{
             "status" => "slow_down"
           }
  end

  test "confirm: inválido e publicado", %{conn: conn} do
    assert json_response(post(conn, "/api/genesis/confirm", %{"token" => "nada"}), 200) ==
             %{"status" => "invalid"}

    assert json_response(post(build_conn(), "/api/genesis/confirm", %{}), 200) ==
             %{"status" => "invalid"}

    post(build_conn(), "/api/genesis/submit", payload())
    token = token_from_mailbox()
    resp = post(build_conn(), "/api/genesis/confirm", %{"token" => token})

    assert %{
             "status" => "published",
             "species" => %{"id" => "sp" <> _, "name" => "Lumina", "code" => _}
           } =
             json_response(resp, 200)
  end

  test "confirm: 429 pelo limite por rede", %{conn: conn} do
    for _ <- 1..20, do: post(build_conn(), "/api/genesis/confirm", %{"token" => "x"})
    assert json_response(post(conn, "/api/genesis/confirm", %{"token" => "x"}), 429)
  end

  test "JSON quebrado não derruba" do
    conn =
      build_conn()
      |> put_req_header("content-type", "application/json")

    assert_error_sent 400, fn -> post(conn, "/api/genesis/submit", "{nope") end
  end

  test "corpo que não é mapa dá 422 sem levantar", %{conn: conn} do
    conn =
      conn
      |> put_req_header("content-type", "application/json")
      |> post("/api/genesis/submit", "[1,2,3]")

    assert %{"status" => "invalid"} = json_response(conn, 422)
  end

  test "corpo grande é recusado", %{conn: conn} do
    body = Jason.encode!(Map.put(payload(), "lixo", String.duplicate("a", 1_000_000)))

    assert_error_sent 413, fn ->
      conn
      |> put_req_header("content-type", "application/json")
      |> post("/api/genesis/submit", body)
    end

    assert Repo.aggregate(VerificationToken, :count) == 0
    assert Repo.aggregate(SpeciesRecord, :count) == 0
  end

  test "catálogo é o arquivo compartilhado", %{conn: conn} do
    body = json_response(get(conn, "/api/genesis/catalog"), 200)
    file = :abyss |> Application.fetch_env!(:catalog_path) |> File.read!() |> Jason.decode!()
    assert body == file
  end

  test "CORS só para as origens do web", %{conn: conn} do
    ok =
      conn |> put_req_header("origin", "http://localhost:5173") |> options("/api/genesis/submit")

    assert response(ok, 204) == ""
    assert get_resp_header(ok, "access-control-allow-origin") == ["http://localhost:5173"]
    assert get_resp_header(ok, "vary") == ["origin"]
    assert get_resp_header(ok, "access-control-allow-methods") == ["GET, POST, OPTIONS"]
    assert get_resp_header(ok, "access-control-allow-headers") == ["content-type"]

    bad =
      build_conn()
      |> put_req_header("origin", "http://evil.test")
      |> options("/api/genesis/submit")

    assert response(bad, 204) == ""
    assert get_resp_header(bad, "access-control-allow-origin") == []

    get_ok =
      build_conn() |> put_req_header("origin", "http://localhost:4173") |> get("/api/health")

    assert get_resp_header(get_ok, "access-control-allow-origin") == ["http://localhost:4173"]
  end

  test "o e-mail não aparece nos logs" do
    previous = Logger.level()
    Logger.configure(level: :debug)
    on_exit(fn -> Logger.configure(level: previous) end)

    {token, log} =
      with_log(fn ->
        post(build_conn(), "/api/genesis/submit", payload())
        token = token_from_mailbox()
        post(build_conn(), "/api/genesis/confirm", %{"token" => token})
        # segundo envio (e-mail já usado) e e-mail inválido também
        post(build_conn(), "/api/genesis/submit", payload())
        post(build_conn(), "/api/genesis/submit", payload("lixo@@" <> @email))
        token
      end)

    assert log =~ "POST /api/genesis/submit"
    refute log =~ @email
    refute String.downcase(log) =~ @normalized
    refute log =~ token
    refute log =~ Base.encode64(token)
  end

  test "stats sem e-mail", %{conn: conn} do
    post(build_conn(), "/api/genesis/submit", payload())
    token = token_from_mailbox()

    assert %{"status" => "published"} =
             json_response(post(build_conn(), "/api/genesis/confirm", %{"token" => token}), 200)

    body = conn |> get("/api/stats") |> response(200)
    refute body =~ "@"
  end
end
