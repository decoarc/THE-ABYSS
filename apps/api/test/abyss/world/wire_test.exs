defmodule Abyss.World.WireTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Sim, Wire}

  @food Application.compile_env!(:abyss, :food) |> Map.new()
  @busy %{@food | particle_rate: 50.0, particle_life_s: 0.05}
  @meta %{world_id: "abc", tick_hz: 10, server_ms: 1_000}

  defp sim(food \\ @food) do
    Sim.new(%{
      population: 20,
      seed: 1,
      now_ms: 5,
      map: Abyss.World.Map.load!("/shared/world/map-e1.json"),
      creature_scale: 0.5,
      test_species: true,
      food: food
    })
    |> Sim.step(0.1)
  end

  test "snapshot tem roster, espécies e bounds" do
    s = Wire.snapshot(sim(), @meta)

    assert s |> Map.keys() |> Enum.sort() ==
             Enum.sort([
               :world_id,
               :tick,
               :tick_hz,
               :server_ms,
               :map_id,
               :creature_scale,
               :bounds,
               :species,
               :organisms,
               :flora,
               :particles,
               :juvenile_scale,
               :divide_s,
               :genomes
             ])

    assert length(s.organisms) == 20
    assert s.bounds == %{y_min: 1.5, y_max: 8.0}
    assert s.map_id == "e1"
    assert s.creature_scale == 0.5
    assert s.tick == 1
    assert length(s.species) == 5
    assert length(s.flora) == 200

    assert Enum.all?(s.flora, fn [x, z, l] ->
             is_number(x) and is_number(z) and l >= 0 and l <= 1
           end)

    assert is_list(s.particles) and Enum.all?(s.particles, &(length(&1) == 9))

    assert hd(s.species) == %{
             id: "membrana",
             code: "MBR",
             name: "Membrana",
             body_radius: 0.55,
             diet: %{kind: "particles", prey: []},
             blueprint: nil,
             extinct_ms: nil,
             parent: nil,
             root: "membrana",
             region: nil,
             born_ms: nil
           }

    assert is_number(s.juvenile_scale) and is_number(s.divide_s)

    o = hd(s.organisms)

    assert o |> Map.keys() |> Enum.sort() == [
             :born_ms,
             :dividing,
             :e,
             :g,
             :gen,
             :id,
             :p,
             :parent,
             :species,
             :stage,
             :v
           ]

    assert is_binary(o.species) and length(o.p) == 3 and length(o.v) == 3
    assert {:ok, _} = Jason.encode(s)
  end

  test "tick segue a ordem do snapshot e arredonda a 3 casas" do
    sim = sim()
    snap = Wire.snapshot(sim, @meta)
    t = Wire.tick(sim, @meta)

    assert t |> Map.keys() |> Enum.sort() == [
             :b,
             :d,
             :f,
             :g,
             :o,
             :pr,
             :ps,
             :rb,
             :server_ms,
             :sp,
             :tick,
             :world_id,
             :x
           ]

    assert length(t.o) == length(snap.organisms)

    for {row, o} <- Enum.zip(t.o, snap.organisms) do
      assert Enum.take(row, 6) == o.p ++ o.v
      assert length(row) == 8
      assert Enum.all?(Enum.take(row, 6), &(&1 == Float.round(&1, 3)))
    end
  end

  test "ps, pr e f batem com os eventos do passo" do
    s1 = sim(@busy)
    s2 = Sim.step(s1, 0.1)

    t1 = Wire.tick(s1, @meta)
    assert t1.ps != []
    assert Enum.map(t1.ps, &hd/1) == Enum.map(s1.food_events.spawned, & &1.id)
    assert Enum.all?(t1.ps, &(length(&1) == 9))
    assert t1.pr == []

    # as nascidas no passo 1 expiram (vida de 50 ms) no passo 2
    t2 = Wire.tick(s2, @meta)
    assert t2.pr == Enum.sort(Enum.map(t1.ps, &hd/1))
    assert t2.pr == s2.food_events.removed
    assert Enum.all?(t2.pr, &is_integer/1)

    for s <- [s1, s2] do
      assert Wire.tick(s, @meta).f == for({i, l} <- s.food_events.changed, do: [i, l])
      assert length(s.food_events.changed) < 200
    end

    snap = Wire.snapshot(s2, @meta)
    assert Enum.map(snap.particles, &hd/1) == Enum.sort(Enum.map(s2.food_events.spawned, & &1.id))
    assert Enum.all?(snap.particles, &(length(&1) == 9))
    assert {:ok, _} = Jason.encode(snap)
    assert {:ok, _} = Jason.encode(t2)
  end

  test "f só traz manchas cujo nível quantizado mudou" do
    {sim, seen} =
      Enum.reduce(1..60, {sim(), []}, fn _, {s, seen} ->
        s = Sim.step(s, 0.1)
        {s, seen ++ Wire.tick(s, @meta).f}
      end)

    assert seen != []
    assert Enum.all?(seen, fn [idx, l] -> idx in 0..199 and l == Float.round(l, 2) end)
    assert length(Wire.snapshot(sim, @meta).flora) == 200
  end

  test "tick com nascimento e morte" do
    s = sim()
    [dead | rest] = s.organisms
    child = %{List.last(rest) | id: "novo", parent_id: dead.id, generation: 2, stage: :juvenile}

    s = %{
      s
      | organisms: rest ++ [child],
        life_events: %{deaths: [{dead.id, :starvation}], births: [child], extinct: []}
    }

    t = Wire.tick(s, @meta)
    assert t.d == [[dead.id, "starvation"]]
    assert [%{id: "novo", stage: "juvenile", gen: 2, parent: pid}] = t.b
    assert pid == dead.id
    assert length(t.o) == length(s.organisms)
    assert t.x == []
    assert {:ok, _} = Jason.encode(t)
  end

  test "x traz as extinções do passo" do
    s = %{sim() | life_events: %{deaths: [], births: [], extinct: [{:filamento, 4200}]}}
    assert Wire.tick(s, @meta).x == [["filamento", 4200]]
  end

  test "flags" do
    s = sim()
    [a, b, c | rest] = s.organisms

    orgs = [
      %{a | stage: :juvenile, dividing_left: 0.0},
      %{b | stage: :adult, dividing_left: 1.5},
      %{c | stage: :adult, dividing_left: 0.0} | rest
    ]

    t = Wire.tick(%{s | organisms: orgs}, @meta)
    assert t.o |> Enum.take(3) |> Enum.map(&List.last/1) == [1, 2, 0]
  end

  test "energia quantizada" do
    s = sim()
    [a, b | rest] = s.organisms
    max = Enum.find(Sim.species(s), &(&1.id == a.species)).energy_max
    orgs = [%{a | energy: max * 0.123456}, %{b | energy: max * 5.0} | rest]
    s = %{s | organisms: orgs}
    t = Wire.tick(s, @meta)
    assert Enum.at(t.o, 0) |> Enum.at(6) == 0.12
    assert Enum.at(t.o, 1) |> Enum.at(6) == 1.0

    assert Enum.all?(t.o, fn row ->
             e = Enum.at(row, 6)
             e >= 0 and e <= 1 and e == Float.round(e, 2)
           end)

    assert hd(Wire.snapshot(s, @meta).organisms).e == 0.12
  end

  test "snapshot leva dieta e extinção" do
    s = %{sim() | extinct: %{filamento: 777}}
    species = Wire.snapshot(s, @meta).species
    fil = Enum.find(species, &(&1.id == "filamento"))
    assert fil.diet == %{kind: "prey", prey: ["celula"]}
    assert fil.extinct_ms == 777
    assert Enum.find(species, &(&1.id == "membrana")).extinct_ms == nil
    assert {:ok, _} = Jason.encode(species)
  end

  describe "espécies criadas" do
    alias Abyss.Genesis.{Catalog, Random, Traits}

    defp made(i) do
      cat = Catalog.get()
      {bp, _} = Random.blueprint(:rand.seed_s(:exsss, i), cat)
      Traits.species(bp, cat, %{id: "sp#{i}", code: "S#{i}", name: "G#{i}"})
    end

    test "espécie criada no snapshot e no tick" do
      sp = %{made(1) | id: "sp1", diet: :predator}
      s = sim() |> Sim.add_species(sp, founders: 3) |> Sim.step(0.1)

      snap = Wire.snapshot(s, @meta)
      item = Enum.find(snap.species, &(&1.id == "sp1"))
      assert item.blueprint == sp.blueprint
      assert item.diet == %{kind: "predator", prey: []}
      assert item.extinct_ms == nil

      t = Wire.tick(s, @meta)
      assert [%{id: "sp1", blueprint: bp}] = t.sp
      assert bp == sp.blueprint
      assert t.b |> Enum.filter(&(&1.species == "sp1")) |> length() == 3
      assert {:ok, _} = Jason.encode(snap)
      assert {:ok, _} = Jason.encode(t)

      assert Wire.tick(Sim.step(s, 0.1), @meta).sp == []
    end

    test "snapshot leva só 100 extintas" do
      base =
        Enum.reduce(1..130, sim(), fn i, acc ->
          sp = made(i)
          bounds = acc.bounds

          bounds = %{
            bounds
            | species: Map.put(bounds.species, sp.id, sp),
              species_list: bounds.species_list ++ [sp]
          }

          %{acc | bounds: bounds, extinct: Map.put(acc.extinct, sp.id, i * 10)}
        end)

      species = Wire.snapshot(base, @meta).species
      extinct = Enum.filter(species, &(&1.extinct_ms != nil))
      assert length(extinct) == 100
      assert extinct |> Enum.map(& &1.extinct_ms) |> Enum.min() == 310
      assert extinct |> Enum.map(& &1.extinct_ms) |> Enum.max() == 1300
      assert length(species) == 105
      assert hd(species).id == "membrana"
    end

    test "fio sem e-mail" do
      sp = made(2) |> Map.put(:email, "a@b.c")
      s = sim() |> Sim.add_species(sp, founders: 3) |> Sim.step(0.1)

      refute Jason.encode!(Wire.snapshot(s, @meta)) =~ "@"
      refute Jason.encode!(Wire.tick(s, @meta)) =~ "@"
    end
  end

  describe "genomas e ramos" do
    alias Abyss.Genesis.{Catalog, Random, Traits}

    defp made2(i) do
      cat = Catalog.get()
      {bp, _} = Random.blueprint(:rand.seed_s(:exsss, i), cat)
      Traits.species(bp, cat, %{id: "sp#{i}", code: "S#{i}", name: "G#{i}"})
    end

    defp with_genome(s, gid, bp) do
      [o | rest] = s.organisms

      %{
        s
        | organisms: [%{o | genome: gid} | rest],
          genomes: Map.put(s.genomes, gid, %{bp: bp, traits: nil})
      }
    end

    test "genoma vai uma vez" do
      s = sim()
      [o | rest] = s.organisms
      bp = made2(7).blueprint
      child = %{o | id: "filho", genome: 9}
      traits = Enum.find(Sim.species(s), &(&1.id == o.species))

      s = %{
        s
        | organisms: [child | rest],
          genomes: Map.put(s.genomes, 9, %{bp: bp, traits: traits}),
          life_events: %{
            deaths: [],
            births: [child],
            extinct: [],
            genomes: [{9, bp}],
            branches: [],
            rebranch: []
          }
      }

      t = Wire.tick(s, @meta)
      assert t.g == [[9, bp]]
      assert [%{id: "filho", g: 9}] = t.b
      assert Enum.all?(t.o, &(length(&1) == 8))
      assert {:ok, _} = Jason.encode(t)

      assert Wire.tick(Sim.step(s, 0.1), @meta).g == []
    end

    test "snapshot leva os genomas vivos" do
      bp = made2(7).blueprint
      s = with_genome(sim(), 4, bp)
      s = %{s | genomes: Map.put(s.genomes, 5, %{bp: bp, traits: nil})}
      snap = Wire.snapshot(s, @meta)
      assert snap.genomes == [[4, bp]]
      assert hd(snap.organisms).g == 4
      assert {:ok, _} = Jason.encode(snap)
    end

    test "ramo no fio" do
      mother = %{made2(1) | id: "sp1", diet: :predator}

      branch =
        Map.merge(made2(2), %{
          id: "sp1.1",
          parent: "sp1",
          root: "sp1",
          region: "floresta",
          born_ms: 900
        })

      s = sim() |> Sim.add_species(mother, founders: 3) |> Sim.step(0.1)
      [o | rest] = s.organisms

      bounds = %{
        s.bounds
        | species: Map.put(s.bounds.species, "sp1.1", branch),
          species_list: s.bounds.species_list ++ [branch]
      }

      s = %{
        s
        | bounds: bounds,
          life_events: %{
            deaths: [],
            births: [],
            extinct: [],
            species: [branch],
            genomes: [],
            branches: [branch],
            rebranch: [{o.id, "sp1.1"}]
          },
          organisms: [o | rest]
      }

      t = Wire.tick(s, @meta)
      assert [%{id: "sp1.1", parent: "sp1", root: "sp1", region: "floresta", born_ms: 900}] = t.sp
      assert t.rb == [[o.id, "sp1.1"]]
      assert {:ok, _} = Jason.encode(t)
    end

    test "datas de espécie e extinção saem em hora real com offset" do
      branch =
        Map.merge(made2(2), %{id: "sp1.1", parent: "sp1", root: "sp1", region: nil, born_ms: 900})

      s =
        sim()
        |> Sim.add_species(%{made2(1) | id: "sp1"}, founders: 3)
        |> Sim.add_species(branch, founders: 0, extinct_ms: 950)
        |> Sim.step(0.1)

      s = %{s | life_events: %{s.life_events | extinct: [{"sp1.1", 950}], species: [branch]}}
      meta = Map.put(@meta, :offset_ms, 10_000)

      snap = Wire.snapshot(s, meta)
      info = Enum.find(snap.species, &(&1.id == "sp1.1"))
      assert info.born_ms == 10_900 and info.extinct_ms == 10_950
      assert Enum.find(snap.species, &(&1.id == "celula")).born_ms == nil
      assert snap.server_ms == @meta.server_ms

      t = Wire.tick(s, meta)
      assert t.x == [["sp1.1", 10_950]]
      assert [%{born_ms: 10_900, extinct_ms: 10_950}] = t.sp
      assert t.server_ms == @meta.server_ms
    end

    test "ancestral extinto vai no snapshot" do
      base =
        Enum.reduce(1..130, sim(), fn i, acc ->
          sp = made2(i)
          b = acc.bounds

          b = %{
            b
            | species: Map.put(b.species, sp.id, sp),
              species_list: b.species_list ++ [sp]
          }

          %{acc | bounds: b, extinct: Map.put(acc.extinct, sp.id, i * 10)}
        end)

      # sp1 (a mais antiga, fora das 100 recentes) é ancestral de um ramo vivo.
      kid = Map.merge(made2(200), %{id: "sp1.1", parent: "sp1", root: "sp1"})
      b = base.bounds

      b = %{
        b
        | species: Map.put(b.species, "sp1.1", kid),
          species_list: b.species_list ++ [kid]
      }

      s = %{base | bounds: b}
      ids = Wire.snapshot(s, @meta).species |> Enum.map(& &1.id)
      assert "sp1" in ids and "sp1.1" in ids
      refute "sp2" in ids
      assert length(ids) == 5 + 100 + 1 + 1
    end

    test "fio sem e-mail com ramos" do
      mother = made2(2) |> Map.put(:email, "a@b.c")

      branch =
        Map.merge(made2(3), %{id: "sp2.1", parent: "sp2", root: "sp2", born_ms: 5, email: "a@b.c"})

      s = sim() |> Sim.add_species(mother, founders: 3) |> Sim.step(0.1)
      b = s.bounds

      b = %{
        b
        | species: Map.put(b.species, "sp2.1", branch),
          species_list: b.species_list ++ [branch]
      }

      s = %{s | bounds: b, life_events: %{s.life_events | species: [branch], branches: [branch]}}
      refute Jason.encode!(Wire.snapshot(s, @meta)) =~ "@"
      refute Jason.encode!(Wire.tick(s, @meta)) =~ "@"
    end
  end
end
