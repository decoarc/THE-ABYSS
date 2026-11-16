defmodule Abyss.World.SimDeathCauseTest do
  use ExUnit.Case, async: true

  alias Abyss.Genesis.{Catalog, Traits}
  alias Abyss.World.{Flora, Organism, Sim}
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @food Application.compile_env!(:abyss, :food) |> Map.new()
  @opts %{
    population: 45,
    seed: 7,
    now_ms: 0,
    map: @map,
    creature_scale: 0.5,
    test_species: false,
    food: %{@food | particle_rate: 0.0}
  }
  @open {62.0, 7.0, -28.0}
  @forest {-48.0, 7.0, -30.0}

  defp world(orgs, opts \\ %{}) do
    sim = Sim.new(Map.merge(@opts, opts))
    %{sim | flora: Flora.put_patches(sim.flora, {}), organisms: orgs}
  end

  defp org(id, species, pos, extra),
    do: struct!(%Organism{id: id, species: species, born_ms: 0, pos: pos}, extra)

  defp shift({x, y, z}, dx), do: {x + dx, y, z}

  defp collect(sim, n) do
    Enum.reduce(1..n, {sim, []}, fn _, {s, acc} ->
      s = Sim.step(s, 0.1)
      {s, acc ++ s.life_events.dead_by}
    end)
  end

  test "predação registra a espécie do caçador" do
    hunter = org("FIL-0001", :filamento, @open, energy: 30.0)
    prey = org("CEL-0001", :celula, shift(@open, -3.0), stage: :juvenile, energy: 50.0)
    {sim, dead_by} = collect(world([hunter, prey]), 150)

    assert dead_by == [{:celula, :predation, :filamento}]
    assert sim.eco_totals.deaths == %{celula: %{predation: 1}}
  end

  test "fome e velhice não têm predador" do
    starving = org("T-0001", :celula, {3.0, 4.0, 0.0}, energy: 0.1)
    {_, dead_by} = collect(world([starving]), 30)
    assert dead_by == [{:celula, :starvation, nil}]

    old = org("T-0002", :celula, {3.0, 4.0, 0.0}, energy: 90.0, stage: :adult, stage_ms: -700_000)
    {sim, dead_by} = collect(world([old]), 5)
    assert dead_by == [{:celula, :old_age, nil}]
    assert sim.eco_totals.deaths == %{celula: %{old_age: 1}}
  end

  test "extinção guarda a última morte" do
    sim = world([org("CEL-0001", :celula, {3.0, 4.0, 0.0}, energy: 0.0)])
    sim = %{sim | next_seq: Map.put(sim.next_seq, :celula, 2)}
    s = Sim.step(sim, 0.1)

    assert s.life_events.extinct == [{:celula, s.now_ms}]
    assert s.life_events.extinct_causes == %{celula: {:starvation, nil}}
    assert Sim.step(s, 0.1).life_events.extinct_causes == %{}
  end

  # --- ramos (mesmo cenário do teste "mãe extinta, ramo vivo" do S2) ---------

  defp gbp(parts) do
    %{
      "v" => 1,
      "body" => %{"spine" => [[-0.3, 0.0, 0.5], [0.0, 0.0, 0.5], [0.3, 0.0, 0.5]]},
      "parts" =>
        for(
          kind <- parts,
          do: %{
            "kind" => kind,
            "at" => 0.5,
            "around" => 1.57,
            "size" => 1.0,
            "angle" => 0.0,
            "mirror" => false
          }
        ),
      "colors" => %{"glow" => "#7fe9dd", "body" => "#3f5a4a"},
      "pattern" => "liso"
    }
  end

  defp branch_world do
    base = Catalog.get()
    cat = %{base | mutation: Map.merge(base.mutation, %{part_p: 0.0, drift_p: 0.0})}
    bps = [gbp(["raspador"]), gbp(["raspador", "ocelo", "ocelo"])]

    root =
      Traits.species(hd(bps), Catalog.get(), %{id: "sp1", code: "S01", name: "Raiz"})
      |> Map.merge(%{parent: nil, root: "sp1", region: nil, born_ms: 0})

    sim = world([], %{catalog: cat}) |> Sim.add_species(root, founders: 0)

    genomes =
      bps
      |> Enum.with_index(1)
      |> Map.new(fn {bp, gid} ->
        {gid,
         %{bp: bp, traits: Traits.species(bp, Catalog.get(), Map.take(root, [:id, :code, :name]))}}
      end)

    {x, y, z} = @forest

    orgs =
      for i <- 1..5,
          do: org("S01-000#{i}", "sp1", {x + i * 1.5, y, z}, genome: 2, energy: 90.0)

    %{
      sim
      | genomes: genomes,
        genome_index: Map.new(genomes, fn {gid, %{bp: bp}} -> {bp, gid} end),
        next_genome: 3,
        organisms: orgs
    }
  end

  test "extinção sem morte é :branched" do
    sim = branch_world()
    s = Sim.step(%{sim | next_scan_ms: sim.now_ms}, 0.1)

    assert [%{id: "sp1.1"}] = s.life_events.branches
    assert {"sp1", s.now_ms} in s.life_events.extinct
    assert s.life_events.extinct_causes["sp1"] == {:branched, nil}
  end
end
