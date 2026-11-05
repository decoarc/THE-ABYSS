defmodule Abyss.World.SimTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Sim, Species}
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @food Application.compile_env!(:abyss, :food) |> Map.new()
  @opts %{
    population: 45,
    seed: 7,
    now_ms: 0,
    map: @map,
    creature_scale: 0.5,
    test_species: true,
    food: @food
  }

  # Testes de movimento não podem perder organismos para fome ou velhice.
  defp immortal(sim) do
    species =
      Map.new(sim.bounds.species, fn {id, sp} ->
        {id, %{sp | metabolism: 0.0, adult_life_s: 1.0e9}}
      end)

    %{sim | bounds: %{sim.bounds | species: species}}
  end

  defp run(sim, n), do: Enum.reduce(1..n, sim, fn _, s -> Sim.step(s, 0.1) end)
  defp norm({x, y, z}), do: :math.sqrt(x * x + y * y + z * z)
  defp dist({a, b, c}, {d, e, f}), do: norm({a - d, b - e, c - f})
  defp xz({x, z}), do: {x, 0.0, z}
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

  test "usa a tabela injetada" do
    zz = %{
      id: :zz,
      code: "ZZZ",
      name: "Zeta",
      max_speed: 0.3,
      wander: 0.3,
      turn_rate: 0.8,
      body_radius: 0.9,
      run_s: nil,
      pause_s: nil,
      diet: :flora,
      perception: 5.0,
      sated_s: 10,
      school: false,
      shelter: false,
      burst: 1.0,
      energy_max: 100.0,
      metabolism: 0.3,
      mature_s: 100,
      adult_life_s: 500
    }

    sim = Sim.new(Map.put(@opts, :species, [zz]))
    assert Sim.species(sim) == [zz]
    assert Enum.all?(sim.organisms, &(&1.species == :zz))
    assert hd(sim.organisms).id == "ZZZ-0001"
    assert length(sim.organisms) == 45
    assert %Sim{} = run(sim, 100)
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
      Enum.reduce(1..600, {immortal(Sim.new(@opts)), %{}}, fn _, {s, acc} ->
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

      %{immortal(sim) | organisms: [o]}
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

    # A faixa de sobreposição Jardim–Floresta tem profundidade de borda ~1,7, menos
    # que a margem da borda macia (3,0): ali a borda não pode empurrar de volta.
    # Começa a 3 da borda da origem, sobre o eixo entre os centros, rumo ao destino;
    # chegar = estar na região de destino com profundidade >= 3 nela.
    for {from, to} <- [{:jardim, :floresta}, {:floresta, :jardim}] do
      test "atravessa de #{from} para #{to}" do
        [a] = Enum.filter(@map.regions, &(&1.id == unquote(from)))
        [b] = Enum.filter(@map.regions, &(&1.id == unquote(to)))
        {ax, az} = a.center
        {bx, bz} = b.center
        len = :math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az))
        {ux, uz} = {(bx - ax) / len, (bz - az) / len}
        start = {ax + ux * (a.radius - 3), 4.0, az + uz * (a.radius - 3)}
        vel = {ux * 0.9, 0.0, uz * 0.9}

        arrived? = fn {x, _, z} ->
          WMap.region_at(@map, x, z) == b.id and
            b.radius - :math.sqrt((x - bx) * (x - bx) + (z - bz) * (z - bz)) >= 3.0
        end

        crossed =
          Enum.count(1..20, fn seed ->
            s0 = solo(Sim.new(%{@opts | seed: seed}), start, vel)
            s0 = %{s0 | organisms: [%{hd(s0.organisms) | yaw: :math.atan2(uz, ux)}]}

            Enum.reduce_while(1..600, s0, fn _, s ->
              s = Sim.step(s, 0.1)
              if arrived?.(hd(s.organisms).pos), do: {:halt, :arrived}, else: {:cont, s}
            end) == :arrived
          end)

        assert crossed >= 12
      end
    end
  end

  describe "comida" do
    alias Abyss.World.{Flora, Organism, Particles}

    # Mundo sem organismos, partículas novas nem flora; os testes põem o que precisam.
    defp bare(seed \\ 7) do
      sim =
        Sim.new(%{@opts | seed: seed, test_species: false, food: %{@food | particle_rate: 0.0}})

      %{sim | flora: Flora.put_patches(sim.flora, {})}
    end

    defp with_patch(sim, x, z, level \\ 1.0) do
      patch = %{x: x, z: z, level: level, rate: 0.0, q: round(level / 0.02)}
      %{sim | flora: Flora.put_patches(sim.flora, {patch})}
    end

    defp with_particle(sim, {x, y, z}) do
      pt = %{
        id: 1,
        p0: {x, y, z},
        v: {0.0, 0.0, 0.0},
        born_ms: 0,
        life_ms: 10_000_000,
        rest_y: 0.3
      }

      %{sim | particles: %{sim.particles | items: %{1 => pt}, next_id: 2}}
    end

    defp with_org(sim, species, pos, extra \\ []) do
      o = struct!(%Organism{id: "T-0001", species: species, born_ms: 0, pos: pos}, extra)
      %{sim | organisms: [o]}
    end

    defp run_collect(sim, n) do
      Enum.reduce(1..n, {sim, [], []}, fn _, {s, d, sp} ->
        s = Sim.step(s, 0.1)
        {s, d ++ s.life_events.deaths, sp ++ s.food_events.spawned}
      end)
    end

    test "comer dá energia" do
      base = bare() |> with_org(:celula, {1.0, 4.0, 0.0}, energy: 50.0)
      fed = base |> with_patch(0.0, 0.0) |> run(50)
      control = run(base, 50)
      assert hd(fed.organisms).energy > hd(control.organisms).energy
    end

    test "morre de fome e vira partículas" do
      sim = bare() |> with_org(:celula, {3.0, 4.0, 0.0}, energy: 0.1)
      {sim, deaths, spawned} = run_collect(sim, 30)
      assert sim.organisms == []
      assert [{"T-0001", :starvation}] = deaths
      r = Sim.body_radius(sim, :celula)
      n = round(3 + 4 * r)
      assert length(spawned) == n
      assert Enum.all?(spawned, fn %{p0: p0} -> dist(p0, {3.0, 4.0, 0.0}) < 2.0 end)
      assert Particles.count(sim.particles) == n
      assert sim.eco_totals.deaths == %{celula: %{starvation: 1}}
    end

    test "morre de velhice" do
      sim =
        bare()
        |> with_org(:celula, {3.0, 4.0, 0.0}, energy: 90.0, stage: :adult, stage_ms: -700_000)

      {sim, deaths, spawned} = run_collect(sim, 5)
      assert sim.organisms == []
      assert [{"T-0001", :old_age}] = deaths
      assert spawned != []
      assert sim.eco_totals.deaths == %{celula: %{old_age: 1}}
    end

    test "fundadores são adultos com energia e idade sorteadas" do
      sim = Sim.new(%{@opts | now_ms: 1_000_000})

      for o <- sim.organisms do
        sp = Species.get!(o.species)
        assert o.stage == :adult and o.generation == 1 and o.parent_id == nil
        assert o.dividing_left == 0.0
        assert o.energy >= 0.5 * sp.energy_max and o.energy <= 0.8 * sp.energy_max
        age = (1_000_000 - o.stage_ms) / 1000
        assert age >= 0 and age <= 0.5 * sp.adult_life_s
      end

      assert sim.organisms |> Enum.map(& &1.energy) |> Enum.uniq() |> length() > 10
      assert sim.life_events == %{deaths: [], births: [], extinct: []}
    end

    test "forrageia até encher" do
      hungry =
        bare() |> with_patch(5.0, 0.0) |> with_org(:celula, {0.0, 4.0, 0.0}, energy: 50.0) |> run(1)

      assert hd(hungry.organisms).target == {:flora, 0}

      full =
        bare() |> with_patch(5.0, 0.0) |> with_org(:celula, {0.0, 4.0, 0.0}, energy: 100.0) |> run(1)

      assert hd(full.organisms).target == nil
    end

    test "Célula come flora" do
      sim = bare() |> with_patch(0.0, 0.0) |> with_org(:celula, {3.0, 4.0, 0.0})
      sim = run(sim, 200)
      assert elem(sim.flora.patches, 0).level < 1
      assert hd(sim.organisms).sated_left > 0
      assert sim.totals.eaten_flora >= 1
    end

    test "Membrana come partícula" do
      sim = bare() |> with_particle({3.0, 4.0, 0.0}) |> with_org(:membrana, {0.0, 4.0, 0.0})

      {sim, removed} =
        Enum.reduce(1..200, {sim, []}, fn _, {s, acc} ->
          s = Sim.step(s, 0.1)
          {s, acc ++ s.food_events.removed}
        end)

      assert 1 in removed
      assert Particles.count(sim.particles) == 0
      assert hd(sim.organisms).sated_left > 0
      assert sim.totals.eaten_particles == 1
    end

    test "Filamento não come" do
      sim =
        bare()
        |> with_patch(0.0, 0.0)
        |> with_particle({1.0, 4.0, 0.0})
        |> with_org(:filamento, {1.0, 4.0, 0.0})
        |> run(200)

      assert elem(sim.flora.patches, 0).level == 1.0
      assert Particles.count(sim.particles) == 1
      assert hd(sim.organisms).sated_left == 0.0 and hd(sim.organisms).target == nil
    end

    test "saciada ignora comida" do
      sim =
        bare()
        |> with_patch(2.0, 0.0)
        |> with_org(:celula, {0.0, 4.0, 0.0}, sated_left: 5.0)
        |> run(10)

      assert hd(sim.organisms).target == nil
      assert elem(sim.flora.patches, 0).level == 1.0
      assert hd(sim.organisms).sated_left < 5.0
    end

    test "faminta e vendo comida, tem alvo" do
      sim = bare() |> with_patch(5.0, 0.0) |> with_org(:celula, {0.0, 4.0, 0.0}) |> run(1)
      assert hd(sim.organisms).target == {:flora, 0}
    end

    # Famintas e sem comida à vista, derivam rumo à região mais rica na dieta
    # (lida de bounds.richest, não fixada no Jardim), partindo de cada outra região.
    # Das regiões que se sobrepõem à mais rica, parte delas tem de chegar lá
    # (inclui Floresta -> Jardim, pela faixa estreita).
    for {sp, prefix} <- [{:celula, "CEL"}, {:membrana, "MBR"}] do
      test "#{sp} vai para a região da sua comida" do
        sp = unquote(sp)
        diet = Enum.find(Species.all(), &(&1.id == sp)).diet
        {rx, rz} = bare().bounds.richest[diet]
        rich = Enum.find(@map.regions, &(&1.id == WMap.region_at(@map, rx, rz)))

        neighbour? = fn %{center: c, radius: r} ->
          dist(xz(c), xz(rich.center)) < r + rich.radius
        end

        arrived =
          for seed <- 1..3, %{center: {cx, cz}} = from <- @map.regions, from != rich do
            orgs =
              for k <- 1..12 do
                a = k * 0.52
                pos = {cx + 8 * :math.cos(a), 4.0, cz + 8 * :math.sin(a)}

                %Organism{
                  id: "#{unquote(prefix)}-#{k}",
                  species: sp,
                  born_ms: 0,
                  pos: pos,
                  yaw: a
                }
              end

            s0 = %{immortal(bare(seed)) | organisms: orgs}
            s1 = run(s0, 6000)

            mean = fn s ->
              Enum.sum(for %{pos: {x, _, z}} <- s.organisms, do: dist({x, 0, z}, xz(rich.center))) /
                12
            end

            assert mean.(s1) < mean.(s0) - 3

            if neighbour?.(from) do
              Enum.count(s1.organisms, fn %{pos: {x, _, z}} ->
                WMap.region_at(@map, x, z) == rich.id
              end)
            else
              0
            end
          end

        assert Enum.sum(arrived) >= 5
      end
    end

    test "comida sem organismos" do
      sim = Sim.new(%{@opts | test_species: false})
      assert sim.organisms == []
      before = Sim.food_stats(sim)
      st = sim |> run(2000) |> Sim.food_stats()

      assert st.flora_level_sum > before.flora_level_sum
      assert st.particles > 0
      assert st.particles_expired_total > 0
      assert st.eaten_flora_total == 0 and st.eaten_particles_total == 0
    end

    test "um tick atrasado não gera partículas em massa" do
      sim = Sim.new(%{@opts | test_species: false}) |> Sim.step(60.0)
      assert Particles.count(sim.particles) < 20
    end
  end
end
