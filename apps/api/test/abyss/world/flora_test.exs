defmodule Abyss.World.FloraTest do
  use ExUnit.Case, async: true

  alias Abyss.World.Flora
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @cfg Application.compile_env!(:abyss, :food) |> Map.new()

  defp new(seed \\ 1), do: Flora.new(@map, :rand.seed_s(:exsss, seed), @cfg) |> elem(0)
  defp patches(f), do: Tuple.to_list(f.patches)

  # Flora de uma só mancha, com a taxa que Flora.new daria àquele ponto.
  defp one(level, x, z) do
    Flora.put_patches(
      new(),
      {%{x: x, z: z, level: level, rate: rate(x, z), q: round(level / 0.02)}}
    )
  end

  defp level(f), do: elem(f.patches, 0).level

  defp rate(x, z) do
    d2 = @map.vents |> Enum.map(fn {vx, vz} -> (x - vx) ** 2 + (z - vz) ** 2 end) |> Enum.min()
    1 / @cfg.flora_grow_s * (1 + @cfg.vent_boost * :math.exp(-d2 / 128))
  end

  test "contagem por região" do
    by = new() |> patches() |> Enum.frequencies_by(&WMap.region_at(@map, &1.x, &1.z))
    assert by == %{jardim: 160, floresta: 30, planicie: 10}
  end

  test "manchas dentro do mapa, longe das esponjas, nível inicial em 0,3..1" do
    for p <- patches(new()) do
      assert WMap.edge_depth(@map, p.x, p.z) > 0
      assert p.level >= 0.3 and p.level <= 1.0

      for s <- @map.sponges do
        assert :math.sqrt((p.x - s.x) ** 2 + (p.z - s.z) ** 2) > s.r
      end
    end
  end

  test "taxa das manchas segue a fórmula da fonte" do
    for p <- patches(new()), do: assert_in_delta(p.rate, rate(p.x, p.z), 1.0e-12)
  end

  test "cresce até o teto" do
    f = Enum.reduce(1..1000, new(), fn _, f -> Flora.step(f, 1.0) |> elem(0) end)
    assert Enum.all?(patches(f), &(&1.level == 1.0))
  end

  test "cresce mais perto da fonte" do
    {near, _} = Flora.step(one(0.3, 2.0, 0.0), 10.0)
    {far, _} = Flora.step(one(0.3, 25.0, 0.0), 10.0)
    assert level(near) - 0.3 > level(far) - 0.3
  end

  test "mordida" do
    {f, eaten} = Flora.bite(one(0.6, 20.0, 0.0), 0, 0.25)
    assert_in_delta level(f), 0.35, 1.0e-9
    assert_in_delta eaten, 0.25, 1.0e-9

    {f, eaten} = Flora.bite(one(0.1, 20.0, 0.0), 0, 0.25)
    assert level(f) == 0.0
    assert_in_delta eaten, 0.1, 1.0e-9
  end

  test "volta a crescer" do
    {f, _} = Flora.bite(one(0.6, 20.0, 0.0), 0, 0.6)
    assert level(f) < 1.0e-9
    {f, _} = Flora.step(f, 10.0)
    assert level(f) > 0.05
  end

  test "changed só quando o quantizado muda" do
    f = one(0.5, 20.0, 0.0)
    r = elem(f.patches, 0).rate
    {f, changed} = Flora.step(f, 0.005 / r)
    assert changed == []
    {f, changed} = Flora.step(f, 0.1 / r)
    assert [{0, q}] = changed
    assert_in_delta q, 0.6, 1.0e-9
    assert {_, []} = Flora.step(f, 0.001 / r)
  end

  test "mordida aparece em changed no passo seguinte" do
    {f, _} = Flora.bite(one(0.6, 20.0, 0.0), 0, 0.25)
    assert {_, [{0, q}]} = Flora.step(f, 0.0)
    assert_in_delta q, 0.36, 1.0e-9
  end

  test "edible_near devolve a mais próxima comestível" do
    f =
      Flora.put_patches(
        new(),
        {%{x: 0.0, z: 0.0, level: 0.01, rate: 0.0, q: 1},
         %{x: 3.0, z: 0.0, level: 0.5, rate: 0.0, q: 25},
         %{x: 1.0, z: 1.0, level: 0.5, rate: 0.0, q: 25}}
      )

    assert Flora.edible_near(f, {0.0, 0.0}, 5.0, 0.05) == 2
    assert Flora.edible_near(f, {0.0, 0.0}, 0.5, 0.05) == nil
    assert Flora.edible_near(f, {3.0, 0.0}, 0.5, 0.05) == 1
  end

  test "determinística pela seed" do
    assert new(5) == new(5)
    refute new(5) == new(6)
  end
end
