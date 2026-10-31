defmodule AbyssWeb.HealthControllerTest do
  use AbyssWeb.ConnCase, async: true

  test "GET /api/health", %{conn: conn} do
    assert json_response(get(conn, "/api/health"), 200) == %{"ok" => true}
  end
end
