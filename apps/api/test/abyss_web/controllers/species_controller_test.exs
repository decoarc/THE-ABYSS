defmodule AbyssWeb.SpeciesControllerTest do
  use AbyssWeb.ConnCase, async: false

  alias Abyss.Genesis.{Catalog, Creator, Random, RateLimit, SpeciesRecord}
  alias Abyss.Repo

  setup do
    RateLimit.reset()
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})

    {bp, _} = Random.blueprint(:rand.seed_s(:exsss, 1), Catalog.get())
    creator = Repo.insert!(%Creator{email_normalized: "ana.secreta@exemplo.com"}, log: false)

    sp =
      Repo.insert!(
        %SpeciesRecord{
          creator_id: creator.id,
          name: "Lumina",
          code: "L1",
          blueprint: bp,
          ruleset: "s1",
          published_at: DateTime.utc_now()
        },
        log: false
      )

    %{sp: sp}
  end

  test "search devolve JSON sem e-mail", %{conn: conn, sp: sp} do
    body = conn |> get("/api/species/search?q=lumi") |> response(200)

    assert %{"results" => [%{"id" => id, "name" => "Lumina", "alive" => true}]} =
             Jason.decode!(body)

    assert id == "sp#{sp.id}"
    refute body =~ "@"
    refute body =~ "email"
  end

  test "history devolve a árvore sem e-mail", %{conn: conn, sp: sp} do
    body = conn |> get("/api/species/sp#{sp.id}/history") |> response(200)

    assert %{"root" => %{"name" => "Lumina", "children" => []}, "restarts" => []} =
             Jason.decode!(body)

    refute body =~ "@"
    refute body =~ "email"
  end

  test "history 404 para id desconhecido", %{conn: conn} do
    assert conn |> get("/api/species/sp999999/history") |> json_response(404)
  end

  test "busca limitada por IP", %{conn: conn} do
    for _ <- 1..60, do: assert(get(conn, "/api/species/search?q=lumi").status == 200)
    assert get(conn, "/api/species/search?q=lumi").status == 429
  end
end
