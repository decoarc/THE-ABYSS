defmodule Abyss.World.SimTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Sim, Species}
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @opts %{
    population: 45,
    seed: 7,
    now_ms: 0,
    map: @map,
    creature_scale: 0.5,
    test_species: true
  }

  defp run(sim, n), do: Enum.reduce(1..n, sim, fn _, s -> Sim.step(s, 0.1) end)
  defp norm({x, y, z}), do: :math.sqrt(x * x + y * y + z * z)
  defp dist({a, b, c}, {d, e, f}), do: norm({a - d, b - e, c - f})
  defp count(sim, sp), do: Enum.count(sim.organisms, &(&1.species == sp))
  defp max_speed(sp), do: Enum.find(Species.all(), &(&1.id == sp)).max_speed

  test "distribui a população pelas espécies" do
    sim = Sim.new(@opts)
    assert Enum.all?(Species.all(), &(count(sim, &1.id) == 9))

    mbr = sim.organisms |> Enum.filter(&(&1.species == :membrana)) |> Enum.map(& &1.id)
    assert mbr == for(i <- 1..9, do: "MBR-" <> String.pad_leading("#{i}", 4, "0"))

    sim = Sim.new(%{@opts | population: 47})
    assert Enum.map(Species.all(), &count(sim, &1.id)) == [10, 10, 9, 9, 9]
  end

  test "aceita 5..400" do
    assert length(Sim.new(%{@opts | population: 400}).organisms) == 400
    assert_raise ArgumentError, fn -> Sim.new(%{@opts | population: 4}) end
    assert_raise ArgumentError, fn -> Sim.new(%{@opts | population: 401}) end
  end

  test "mundo vazio" do
    sim = Sim.new(%{@opts | test_species: false})
    assert sim.organisms == []
    assert Sim.step(sim, 0.1).tick == 1
  end

  test "raio efetivo" do
    assert Sim.body_radius(Sim.new(@opts), :membrana) == 1.1 * 0.5
  end

  test "distribui pela comida" do
    sim = Sim.new(%{@opts | population: 150})

    in_region = fn sp ->
      sim.organisms
      |> Enum.filter(&(&1.species == sp))
      |> Enum.frequencies_by(fn %{pos: {x, _, z}} -> WMap.region_at(@map, x, z) end)
    end

    total = fn f -> f |> Map.values() |> Enum.sum() end

    for sp <- [:celula, :casco] do
      f = in_region.(sp)
      assert Map.get(f, :jardim, 0) > total.(f) / 2
    end

    f = in_region.(:membrana)
    assert Map.get(f, :planicie, 0) > total.(f) / 2

    for sp <- [:filamento, :poliedro] do
      f = in_region.(sp)
      assert Enum.all?([:jardim, :floresta, :planicie], &(Map.get(f, &1, 0) > 0))
    end
  end

  test "não atravessam esponjas" do
    sim = run(Sim.new(@opts), 3000)

    for o <- sim.organisms, sp <- @map.sponges do
      {x, y, z} = o.pos
      r = Sim.body_radius(sim, o.species)

      if y < sp.h do
        d = :math.sqrt((x - sp.x) * (x - sp.x) + (z - sp.z) * (z - sp.z))
        assert d >= sp.r + r - 0.05
      end
    end
  end

  test "é determinístico pela seed" do
    a = @opts |> Sim.new() |> run(100)
    b = @opts |> Sim.new() |> run(100)
    assert a == b
    c = %{@opts | seed: 8} |> Sim.new() |> run(100)
    refute Enum.map(a.organisms, & &1.pos) == Enum.map(c.organisms, & &1.pos)
    assert a.tick == 100
  end

  test "todos ficam no mapa" do
    sim = run(Sim.new(@opts), 3000)

    for o <- sim.organisms do
      {x, y, z} = o.pos
      assert WMap.edge_depth(@map, x, z) >= -0.5 - 1.0e-9
      assert y >= 1.5 and y <= 8.0
      assert x == x and y == y and z == z
    end
  end

  test "respeita max_speed" do
    Enum.reduce(1..300, Sim.new(@opts), fn _, s ->
      s = Sim.step(s, 0.1)
      for o <- s.organisms, do: assert(norm(o.vel) <= max_speed(o.species) * 1.001)
      s
    end)
  end

  test "evita sobreposição" do
    sim = run(Sim.new(@opts), 600)
    rad = Map.new(Species.all(), &{&1.id, Sim.body_radius(sim, &1.id)})

    for a <- sim.organisms, b <- sim.organisms, a.id < b.id do
      assert dist(a.pos, b.pos) >= 0.5 * (rad[a.species] + rad[b.species])
    end
  end

  test "cada espécie mantém seu ritmo" do
    # deslocamento = distância percorrida (soma dos passos): o líquido do Filamento
    # é diluído pelo seu vagar errático, o que não diz nada sobre o ritmo.
    {_, path} =
      Enum.reduce(1..600, {Sim.new(@opts), %{}}, fn _, {s, acc} ->
        s2 = Sim.step(s, 0.1)

        acc =
          Enum.zip(s.organisms, s2.organisms)
          |> Enum.reduce(acc, fn {a, b}, m ->
            Map.update(m, a.id, dist(a.pos, b.pos), &(&1 + dist(a.pos, b.pos)))
          end)

        {s2, acc}
      end)

    mean = fn prefix ->
      d = for {id, v} <- path, String.starts_with?(id, prefix), do: v
      Enum.sum(d) / length(d)
    end

    assert mean.("FIL") > 5 * mean.("CAS")
  end

  test "Célula pausa e volta" do
    paused =
      Enum.reduce(1..300, {Sim.new(@opts), false}, fn _, {s, hit} ->
        s = Sim.step(s, 0.1)

        hit =
          hit or
            Enum.any?(
              s.organisms,
              &(&1.species == :celula and &1.mode == :pause and norm(&1.vel) < 0.05)
            )

        {s, hit}
      end)
      |> elem(1)

    assert paused
  end

  describe "cenários forçados" do
    alias Abyss.World.Organism

    defp solo(sim, pos, vel) do
      o = %Organism{
        id: "FIL-0001",
        species: :filamento,
        born_ms: 0,
        pos: pos,
        vel: vel,
        yaw: 0.0,
        mode: :run,
        mode_left: 0.0
      }

      %{sim | organisms: [o]}
    end

    test "esponja no caminho: nunca entra no cilindro" do
      sp = Enum.max_by(@map.sponges, &WMap.edge_depth(@map, &1.x, &1.z))
      map = %{@map | sponges: [sp]}
      sim = Sim.new(%{@opts | map: map})
      reff = sp.r + Sim.body_radius(sim, :filamento)
      start = {sp.x - (reff + 0.3), min(2.0, sp.h - 0.2), sp.z}

      Enum.reduce(1..200, solo(sim, start, {0.9, 0.0, 0.0}), fn _, s ->
        s = Sim.step(s, 0.1)
        {x, y, z} = hd(s.organisms).pos
        d = :math.sqrt((x - sp.x) * (x - sp.x) + (z - sp.z) * (z - sp.z))
        assert y >= sp.h or d >= reff - 0.05
        s
      end)
    end

    test "na borda rumo a fora: fica a >= -0.5 e volta para dentro" do
      [pl] = Enum.filter(@map.regions, &(&1.id == :planicie))
      {cx, cz} = pl.center
      start = {cx + pl.radius + 0.4, 4.0, cz}
      sim = solo(Sim.new(@opts), start, {0.9, 0.0, 0.0})

      final =
        Enum.reduce(1..300, sim, fn _, s ->
          s = Sim.step(s, 0.1)
          {x, _, z} = hd(s.organisms).pos
          assert WMap.edge_depth(@map, x, z) >= -0.5 - 1.0e-9
          s
        end)

      {x, _, z} = hd(final.organisms).pos
      assert WMap.edge_depth(@map, x, z) > 0
    end
  end
end
