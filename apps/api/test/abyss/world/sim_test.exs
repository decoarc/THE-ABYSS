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
  defp burst(sp), do: Enum.find(Species.all(), &(&1.id == sp)).burst

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

  test "aceita 5..pop_cap" do
    assert length(Sim.new(%{@opts | population: 250}).organisms) == 250
    assert_raise ArgumentError, fn -> Sim.new(%{@opts | population: 4}) end
    assert_raise ArgumentError, fn -> Sim.new(%{@opts | population: 251}) end

    eco = Map.new(Application.fetch_env!(:abyss, :ecology)) |> Map.put(:pop_cap, 400)
    assert length(Sim.new(Map.put(%{@opts | population: 400}, :ecology, eco)).organisms) == 400

    big = Map.put(eco, :pop_cap, 401)
    assert_raise ArgumentError, fn -> Sim.new(Map.put(%{@opts | population: 45}, :ecology, big)) end
  end

  test "população inicial respeita o teto" do
    eco = Map.new(Application.fetch_env!(:abyss, :ecology)) |> Map.put(:pop_cap, 20)
    assert length(Sim.new(Map.put(%{@opts | population: 20}, :ecology, eco)).organisms) == 20
    assert_raise ArgumentError, fn -> Sim.new(Map.put(%{@opts | population: 21}, :ecology, eco)) end
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

  # Caçar e fugir usam o arranque (max_speed × burst); fora disso, max_speed.
  test "respeita max_speed" do
    Enum.reduce(1..300, Sim.new(@opts), fn _, s ->
      s = Sim.step(s, 0.1)
      for o <- s.organisms, do: assert(norm(o.vel) <= max_speed(o.species) * burst(o.species) * 1.001)
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

  describe "divisão" do
    alias Abyss.World.{Flora, Organism}

    defp bare_world(cap \\ 250) do
      sim =
        Sim.new(%{@opts | test_species: false, food: %{@food | particle_rate: 0.0}})

      # Um fundador de cada espécie é posto à mão como "-0001": o próximo é o 2.
      seq = Map.new(sim.next_seq, fn {sp, _} -> {sp, 2} end)

      %{
        sim
        | flora: Flora.put_patches(sim.flora, {}),
          ecology: %{sim.ecology | pop_cap: cap},
          next_seq: seq
      }
    end

    defp adult(id, species, pos, extra \\ []) do
      struct!(
        %Organism{id: id, species: species, born_ms: 0, pos: pos, energy: 100.0, stage: :adult},
        extra
      )
    end

    defp step_until_birth(sim, max) do
      Enum.reduce_while(1..max, {sim, []}, fn _, {s, hist} ->
        s = Sim.step(s, 0.1)
        if s.life_events.births != [], do: {:halt, {s, [s | hist]}}, else: {:cont, {s, [s | hist]}}
      end)
    end

    test "divide quando enche" do
      sim = %{bare_world() | organisms: [adult("CEL-0001", :celula, {1.0, 4.0, 0.0})]}
      sp = Enum.find(Species.all(), &(&1.id == :celula))
      eco = sim.ecology

      # Há flora ao alcance: dividindo, ele não procura comida.
      patch = %{x: 2.0, z: 0.0, level: 1.0, rate: 0.0, q: 50}
      sim = %{sim | flora: Flora.put_patches(sim.flora, {patch})}

      s1 = Sim.step(sim, 0.1)
      assert [%{dividing_left: left}] = s1.organisms
      assert left == eco.divide_s

      {final, hist} = step_until_birth(s1, 40)
      assert length(hist) == 20
      assert final.totals.eaten_flora == 0

      for s <- hist, o <- s.organisms, o.dividing_left > 0 do
        assert norm(o.vel) <= sp.max_speed * 0.3 + 1.0e-9
      end

      assert [child] = final.life_events.births
      [parent, last] = final.organisms
      assert last == child
      assert parent.id == "CEL-0001" and parent.dividing_left == 0
      assert_in_delta parent.energy, 0.5 * sp.energy_max, 1.0e-9
      assert child.id == "CEL-0002" and final.next_seq.celula == 3
      assert child.stage == :juvenile and child.stage_ms == final.now_ms
      assert child.generation == 2 and child.parent_id == "CEL-0001"
      assert_in_delta child.energy, 0.35 * sp.energy_max, 1.0e-9
      assert child.vel == parent.vel
      assert final.eco_totals.births == %{celula: 1}

      {px, py, pz} = parent.pos
      {cx, cy, cz} = child.pos
      r = Sim.body_radius(final, :celula)
      assert_in_delta :math.sqrt((cx - px) ** 2 + (cz - pz) ** 2), r, 1.0e-9
      assert_in_delta cy, py, 1.0e-9
      side = parent.yaw + :math.pi() / 2
      assert_in_delta cx - px, r * :math.cos(side), 1.0e-9
      assert_in_delta cz - pz, r * :math.sin(side), 1.0e-9
    end

    test "jovem não divide" do
      o = adult("CEL-0001", :celula, {1.0, 4.0, 0.0}, stage: :juvenile)
      sim = %{bare_world() | organisms: [o]}
      sim = Enum.reduce(1..100, sim, fn _, s -> Sim.step(%{s | organisms: Enum.map(s.organisms, &%{&1 | energy: 100.0})}, 0.1) end)
      assert [%{dividing_left: +0.0, stage: :juvenile}] = sim.organisms
      assert sim.eco_totals.births == %{}
    end

    test "filho herda as características" do
      sim = %{bare_world() | organisms: [adult("POL-0001", :poliedro, {1.0, 4.0, 0.0})]}
      {final, _} = step_until_birth(sim, 40)
      [child] = final.life_events.births
      assert child.species == :poliedro
      assert Map.fetch!(final.bounds.species, child.species) == Map.fetch!(sim.bounds.species, :poliedro)
    end

    test "ids não se repetem" do
      sim = bare_world()

      parents =
        for {sp, i} <- Enum.with_index([:celula, :membrana, :casco]),
            do: adult("#{String.upcase(String.slice("#{sp}", 0, 3))}-0001", sp, {1.0 + i * 8, 4.0, 0.0})

      sim = %{sim | organisms: parents}
      codes = Map.new(Species.all(), &{&1.id, &1.code})
      sim = %{sim | organisms: Enum.map(parents, &%{&1 | id: "#{codes[&1.species]}-0001"})}

      {sim, ids, births} =
        Enum.reduce(1..400, {sim, MapSet.new(Enum.map(sim.organisms, & &1.id)), 0}, fn i, {s, ids, b} ->
          s = %{s | organisms: Enum.map(s.organisms, fn o -> if o.stage == :adult, do: %{o | energy: 100.0}, else: o end)}
          s = Sim.step(s, 0.1)
          new_ids = Enum.map(s.life_events.births, & &1.id)
          assert Enum.all?(new_ids, &(not MapSet.member?(ids, &1)))
          ids = Enum.reduce(new_ids, ids, &MapSet.put(&2, &1))
          # morte intercalada: some com o filho mais novo a cada 10 passos
          s =
            if rem(i, 10) == 0 do
              %{s | organisms: Enum.reject(s.organisms, &(&1.id == List.last(new_ids || [nil])))}
            else
              s
            end

          {s, ids, b + length(new_ids)}
        end)

      assert births >= 50
      assert MapSet.size(ids) >= 50
      assert Enum.sum(Enum.map(Species.all(), &(sim.next_seq[&1.id] - 1))) >= 50 + 5
    end

    test "teto segura a divisão" do
      orgs = for i <- 1..20, do: adult("CEL-#{String.pad_leading("#{i}", 4, "0")}", :celula, {1.0 + i * 1.0, 4.0, 0.0})
      sim = %{bare_world(20) | organisms: orgs}

      sim = Enum.reduce(1..100, sim, fn _, s -> Sim.step(s, 0.1) end)

      assert length(sim.organisms) == 20
      assert sim.eco_totals.cap_holds > 0
      assert Enum.all?(sim.organisms, &(&1.dividing_left == 0 and &1.energy == 100.0))
      assert sim.life_events.deaths == [] and sim.eco_totals.deaths == %{}
      assert sim.eco_totals.births == %{}

      # Abre uma vaga: um deles começa a dividir no passo seguinte.
      sim = %{sim | organisms: tl(sim.organisms)}
      s = Sim.step(sim, 0.1)
      assert Enum.count(s.organisms, &(&1.dividing_left > 0)) == 1
    end
  end

  describe "predação" do
    alias Abyss.World.{Flora, Organism}

    @open {62.0, 7.0, -28.0}
    @forest {-48.0, 7.0, -30.0}

    # Mundo vazio, sem flora nem partículas novas; os testes põem caçador e presa.
    defp hunt_world(orgs, seed \\ 7) do
      sim = Sim.new(%{@opts | seed: seed, test_species: false, food: %{@food | particle_rate: 0.0}})
      %{sim | flora: Flora.put_patches(sim.flora, {}), organisms: orgs}
    end

    defp hunter(pos, extra \\ []),
      do: struct!(%Organism{id: "FIL-0001", species: :filamento, born_ms: 0, pos: pos, energy: 30.0}, extra)

    defp young(pos, extra \\ []),
      do:
        struct!(
          %Organism{id: "CEL-0001", species: :celula, born_ms: 0, pos: pos, stage: :juvenile, energy: 50.0},
          extra
        )

    defp shift({x, y, z}, dx), do: {x + dx, y, z}
    defp find(sim, id), do: Enum.find(sim.organisms, &(&1.id == id))

    defp with_traits(sim, id, traits) do
      sp = Map.merge(Map.fetch!(sim.bounds.species, id), traits)
      %{sim | bounds: %{sim.bounds | species: Map.put(sim.bounds.species, id, sp)}}
    end

    # Passos até a presa sumir (ou `max`): {passo da captura | nil, sim antes, sim depois, spawned}.
    defp until_gone(sim, id, max) do
      Enum.reduce_while(1..max, {nil, sim, sim, []}, fn n, {_, _, s, sp} ->
        s2 = Sim.step(s, 0.1)
        sp = sp ++ s2.food_events.spawned
        if find(s2, id) == nil, do: {:halt, {n, s, s2, sp}}, else: {:cont, {nil, s, s2, sp}}
      end)
    end

    test "caçador come presa jovem" do
      sim = hunt_world([hunter(@open), young(shift(@open, -3.0))])
      {n, before, after_, spawned} = until_gone(sim, "CEL-0001", 150)

      assert n != nil
      assert after_.life_events.deaths == [{"CEL-0001", :predation}]
      assert spawned == []
      assert after_.eco_totals.hunts_ok == 1
      assert after_.eco_totals.deaths == %{celula: %{predation: 1}}

      h0 = find(before, "FIL-0001")
      prey = find(before, "CEL-0001")
      h1 = find(after_, "FIL-0001")
      gain = sim.ecology.prey_base + sim.ecology.prey_yield * prey.energy
      assert_in_delta h1.energy, h0.energy + gain, 0.5
      assert h1.target == nil and h1.sated_left > 0
    end

    test "caçador cheio não caça" do
      sim = hunt_world([hunter(@open, energy: 80.0), young(shift(@open, -3.0))])

      final =
        Enum.reduce(1..30, sim, fn _, s ->
          s = Sim.step(s, 0.1)
          refute match?({:prey, _}, find(s, "FIL-0001").target)
          s
        end)

      assert final.eco_totals.hunts_ok == 0
      assert find(final, "CEL-0001") != nil
    end

    test "presa foge" do
      # Caçador ao sul (−z): a deriva e o abrigo puxam para −x, só a fuga empurra para +z.
      {x, y, z} = @open
      h = hunter({x, y, z - 5.5})
      p = young(@open)
      sim = immortal(hunt_world([h, p]))
      d0 = dist(p.pos, h.pos)

      s = run(sim, 20)
      prey = find(s, "CEL-0001")
      assert prey != nil
      assert dist(prey.pos, h.pos) > d0
      {_, _, pz} = prey.pos
      {_, _, vz} = prey.vel
      assert pz > z + 0.3
      assert vz > 0.2
    end

    test "desiste" do
      # Caçador lento demais para alcançar; presa que não vê ameaça e fica por perto.
      sim =
        hunt_world([hunter(@open), young(shift(@open, -3.0))])
        |> immortal()
        |> with_traits(:filamento, %{max_speed: 0.05})
        |> with_traits(:celula, %{perception: 0.0})

      s1 = Sim.step(sim, 0.1)
      assert find(s1, "FIL-0001").target == {:prey, "CEL-0001"}

      {n, s} =
        Enum.reduce_while(2..120, {nil, s1}, fn n, {_, s} ->
          s = Sim.step(s, 0.1)
          if find(s, "FIL-0001").target == nil, do: {:halt, {n, s}}, else: {:cont, {nil, s}}
        end)

      assert n != nil
      assert_in_delta n * 0.1, 0.1 + sim.ecology.give_up_s, 0.25
      assert s.eco_totals.hunts_abandoned == 1
      assert s.eco_totals.hunts_ok == 0
      assert find(s, "CEL-0001") != nil
    end

    test "abrigo ajuda" do
      # Tempo até ser comida (no máximo 60 s), com a mesma semente dentro e fora.
      survival = fn at, seed ->
        sim = hunt_world([hunter(at), young(shift(at, -3.0))], seed) |> immortal()

        case until_gone(sim, "CEL-0001", 600) do
          {nil, _, _, _} -> 60.0
          {n, _, _, _} -> n * 0.1
        end
      end

      inside = for seed <- 1..20, do: survival.(@forest, seed)
      outside = for seed <- 1..20, do: survival.(@open, seed)
      mean = fn l -> Enum.sum(l) / length(l) end

      IO.puts("\n[abrigo] média dentro #{mean.(inside)} s, fora #{mean.(outside)} s")
      assert mean.(inside) > mean.(outside)
    end
  end
end
