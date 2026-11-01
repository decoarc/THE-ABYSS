defmodule Abyss.World.MapTest do
  use ExUnit.Case, async: true

  alias Abyss.World.Map, as: WorldMap

  setup_all do
    {:ok, map: WorldMap.load!(Application.fetch_env!(:abyss, :map_path))}
  end

  test "carrega o mapa", %{map: map} do
    assert length(map.regions) == 3
    assert Enum.all?(map.regions, &(&1.radius >= 20 and &1.radius <= 50))
    assert length(map.vents) == 4
  end

  test "edge_depth", %{map: map} do
    assert WorldMap.edge_depth(map, 0, 0) == 30.0
    assert WorldMap.edge_depth(map, 62, -28) == 45.0
    assert WorldMap.edge_depth(map, 200, 200) < 0
  end

  test "region_at", %{map: map} do
    assert WorldMap.region_at(map, 0, 0) == :jardim
    assert WorldMap.region_at(map, 62, -28) == :planicie
    assert WorldMap.region_at(map, -48, -30) == :floresta
  end

  test "inward aponta para dentro", %{map: map} do
    {dx, dz} = WorldMap.inward(map, 100, -28)
    assert dx < 0
    assert_in_delta dx * dx + dz * dz, 1.0, 1.0e-9
  end

  test "esponjas dentro da Floresta", %{map: map} do
    assert map.sponges != []
    assert Enum.all?(map.sponges, &(WorldMap.region_at(map, &1.x, &1.z) == :floresta))
  end
end
