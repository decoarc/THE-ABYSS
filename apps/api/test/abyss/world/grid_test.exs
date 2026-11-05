defmodule Abyss.World.GridTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Flora, Grid, Particles, Sim}
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @food Application.compile_env!(:abyss, :food) |> Map.new()

  # --- buscas lineares de referência (a versão anterior à grade) ---------------

  defp flora_linear(flora, {x, z}, range, min_level) do
    flora.patches
    |> Tuple.to_list()
    |> Enum.with_index()
    |> Enum.reduce({nil, range}, fn {p, idx}, {best, best_d} = acc ->
      d = :math.sqrt((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z))

      if p.level >= min_level and d <= best_d and (best == nil or d < best_d),
        do: {idx, d},
        else: acc
    end)
    |> elem(0)
  end

  defp particles_linear(p, {x, y, z}, range, now_ms) do
    y = max(y, @map.y_min)

    p.items
    |> Enum.reduce({nil, range}, fn {id, pt}, {best, best_d} = acc ->
      {px, py, pz} = Particles.position(pt, now_ms)
      py = max(py, @map.y_min)
      d = :math.sqrt((px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z))
      if d <= best_d and (best == nil or d < best_d), do: {id, d}, else: acc
    end)
    |> elem(0)
  end

  # Mundo semeado com a comida no teto: 100 s sem organismos (taxa de
  # partículas dobrada), flora toda em 1, depois mordidas em metade das manchas
  # para haver manchas abaixo do mínimo comestível.
  defp seeded_world do
    sim =
      Sim.new(%{
        population: 150,
        seed: 20_261_104,
        now_ms: 0,
        map: @map,
        creature_scale: 0.5,
        test_species: true,
        food: @food
      })

    fill = %{
      sim
      | organisms: [],
        particles: %{sim.particles | cfg: %{@food | particle_rate: 4.0}}
    }

    filled = Enum.reduce(1..200, fill, fn _, s -> Sim.step(s, 0.5) end)

    flora =
      Enum.reduce(0..(tuple_size(filled.flora.patches) - 1)//2, filled.flora, fn idx, f ->
        f |> Flora.bite(idx, 0.98) |> elem(0)
      end)

    %{filled | organisms: sim.organisms, flora: flora}
  end

  # Pontos de consulta: os organismos e uma malha de passo 1,7 sobre o mapa
  # (passo que não casa com a célula 8, para cair em bordas e cantos).
  defp probes(sim) do
    lattice =
      for x <- -80..110//2, z <- -65..20//2, do: {x * 0.85, 2.0 + rem(abs(x + z), 6), z * 0.85}

    Enum.map(sim.organisms, & &1.pos) ++ lattice
  end

  test "flora: a grade escolhe a mesma mancha que a varredura linear" do
    sim = seeded_world()
    min = @food.flora_min_edible

    results =
      for {x, _, z} <- probes(sim), range <- [4.0, 6.0, 8.0, 13.5] do
        got = Flora.edible_near(sim.flora, {x, z}, range, min)
        assert got == flora_linear(sim.flora, {x, z}, range, min), "em #{inspect({x, z, range})}"
        got
      end

    # O teste só vale se houve acertos e erros de verdade.
    assert Enum.count(results, &is_integer/1) > 200
    assert Enum.count(results, &is_nil/1) > 200
  end

  test "partículas: a grade escolhe a mesma partícula que a varredura linear" do
    sim = seeded_world()
    assert Particles.count(sim.particles) >= 380

    for now <- [sim.now_ms, sim.now_ms + 7_300, sim.now_ms + 60_000] do
      results =
        for pos <- probes(sim), range <- [6.0, 9.0] do
          got = Particles.near(sim.particles, pos, range, now)

          assert got == particles_linear(sim.particles, pos, range, now),
                 "em #{inspect({pos, range, now})}"

          got
        end

      assert Enum.count(results, &is_integer/1) > 200
      assert Enum.count(results, &is_nil/1) > 50
    end
  end

  test "partículas: o índice ignora as que saíram depois de montado" do
    sim = seeded_world()
    now = sim.now_ms
    index = Particles.index(sim.particles, now)
    pos = hd(sim.organisms).pos

    # Tira, uma a uma, a mais próxima: o índice antigo deve concordar com a busca linear.
    Enum.reduce(1..30, sim.particles, fn _, p ->
      got = Particles.near_in(p, index, pos, 40.0)
      assert got == particles_linear(p, pos, 40.0, now)
      assert got != nil
      p |> Particles.take(got) |> elem(0)
    end)
  end

  test "desempate: menor índice / menor id" do
    patch = %{x: 1.0, z: 1.0, level: 1.0, rate: 0.0, q: 50}
    {flora, _} = Flora.new(@map, :rand.seed_s(:exsss, 1), @food)
    flora = Flora.put_patches(flora, {%{patch | x: 20.0}, patch, patch})
    assert Flora.edible_near(flora, {0.0, 0.0}, 5.0, 0.05) == 1

    pt = %{p0: {1.0, 3.0, 1.0}, v: {0.0, 0.0, 0.0}, born_ms: 0, life_ms: 10_000, rest_y: 0.3}
    items = for id <- [9, 4, 7], into: %{}, do: {id, Map.put(pt, :id, id)}
    p = %{Particles.new(@map, @food) | items: items}
    assert Particles.near(p, {0.0, 3.0, 0.0}, 5.0, 0) == 4
  end

  test "grade: near cobre o quadrado; discos aparecem em toda célula que tocam" do
    g =
      Grid.build([
        {0.5, 0.5, :a},
        {7.9, 0.1, :b},
        {8.1, 0.1, :c},
        {-0.1, -0.1, :d},
        {0.6, 0.6, :e}
      ])

    assert Grid.at(g, 1.0, 1.0) == [:a, :b, :e]
    assert Enum.sort(Grid.near(g, 0.5, 0.5, 1.0)) == [:a, :b, :d, :e]
    assert Enum.sort(Grid.near(g, 7.0, 0.5, 1.5)) == [:a, :b, :c, :e]
    assert Grid.near(g, 4.0, 4.0, 1.0) == [:a, :b, :e]

    d = Grid.build_discs([{8.0, 8.0, 1.0, :s}])

    for {x, z} <- [{7.2, 7.2}, {8.8, 8.8}, {7.2, 8.8}, {8.8, 7.2}],
        do: assert(Grid.at(d, x, z) == [:s])

    assert Grid.at(d, 17.0, 8.0) == []
  end
end
