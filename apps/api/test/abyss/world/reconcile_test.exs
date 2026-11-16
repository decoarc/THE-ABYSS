defmodule Abyss.World.ReconcileTest do
  use ExUnit.Case, async: true

  alias Abyss.Genesis.{Catalog, Random, Traits}
  alias Abyss.World.{Reconcile, Sim}
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @food Application.compile_env!(:abyss, :food) |> Map.new()
  @offset 7_200_000
  @real 1_800_000_000_000

  defp made(i, extra \\ %{}) do
    cat = Catalog.get()
    {bp, _} = Random.blueprint(:rand.seed_s(:exsss, {i, 5, 5}), cat)

    Traits.species(bp, cat, %{id: "sp#{i}", code: "S#{i}", name: "G#{i}"})
    |> Map.merge(%{parent: nil, root: "sp#{i}", region: nil, born_ms: @real - 50_000})
    |> Map.merge(extra)
  end

  # Mundo "fotografado" com sp1 (3 vivas), já passado um passo.
  defp saved do
    Sim.new(%{
      population: 5,
      seed: 2,
      now_ms: @real - @offset,
      map: @map,
      creature_scale: 0.5,
      test_species: false,
      food: @food,
      catalog: Catalog.get()
    })
    |> Sim.add_species(made(1, %{born_ms: @real - @offset - 50_000}))
    |> Sim.step(0.1)
  end

  defp count(sim, id),
    do: Enum.count(sim.organisms ++ sim.pending_founders, &(&1.species == id))

  test "nada a reconciliar não muda o Sim" do
    sim = saved()
    assert Reconcile.apply(sim, %{live: [made(1)], extinct: []}, @offset) == sim
  end

  test "espécie criada depois da fotografia nasce com 3" do
    sim = Reconcile.apply(saved(), %{live: [made(1), made(2)], extinct: []}, @offset)
    assert count(sim, "sp2") == 3
    assert sim.bounds.species["sp2"].born_ms == @real - 50_000 - @offset
    assert count(sim, "sp1") == 3
  end

  test "ramo gravado depois da fotografia volta com 3 da planta dele" do
    branch = made(9, %{id: "sp1.1", code: "S1.1", parent: "sp1", root: "sp1", region: "floresta"})
    sim = Reconcile.apply(saved(), %{live: [made(1), branch], extinct: []}, @offset)

    founders = Enum.filter(sim.pending_founders, &(&1.species == "sp1.1"))
    assert length(founders) == 3
    gid = hd(founders).genome
    assert sim.genomes[gid].bp == branch.blueprint
    assert sim.branch_seq["sp1"] == 1
  end

  test "extinção gravada depois vale a do banco" do
    sim = Reconcile.apply(saved(), %{live: [], extinct: [{made(1), @real - 1_000}]}, @offset)
    assert count(sim, "sp1") == 0
    assert sim.extinct["sp1"] == @real - 1_000 - @offset
    # Não é extinção nova do mundo: o passo seguinte não a anuncia de novo.
    assert Sim.step(sim, 0.1).life_events.extinct == []
  end

  test "extinta no banco e ausente no Sim entra extinta" do
    sim =
      Reconcile.apply(
        saved(),
        %{live: [made(1)], extinct: [{made(3), @real - 9_000}]},
        @offset
      )

    assert sim.extinct["sp3"] == @real - 9_000 - @offset
    assert count(sim, "sp3") == 0
  end
end
