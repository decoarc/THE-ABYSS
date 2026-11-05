defmodule AbyssWeb.StatsControllerTest do
  use AbyssWeb.ConnCase, async: false

  setup do
    start_supervised!(
      {Abyss.World.Server, population: 10, tick_hz: 20, seed: 1, broadcast: fn _ -> :ok end}
    )

    :ok
  end

  test "GET /api/stats", %{conn: conn} do
    body = json_response(get(conn, "/api/stats"), 200)
    assert Map.has_key?(body, "tick")
    assert Map.has_key?(body, "jitter_ms_p99")
    assert Map.has_key?(body, "observers")

    for k <-
          ~w(flora_patches flora_level_sum particles eaten_flora_total eaten_particles_total particles_expired_total) do
      assert is_number(body[k]), "falta #{k}"
    end
  end
end
