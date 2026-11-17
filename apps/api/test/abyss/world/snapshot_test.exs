defmodule Abyss.World.SnapshotTest do
  use ExUnit.Case, async: true

  alias Abyss.Genesis.{Catalog, Random, Traits}
  alias Abyss.World.{Organism, Sim, Snapshot}
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @food Application.compile_env!(:abyss, :food) |> Map.new()
  @ctx %{map: @map, catalog: Catalog.get(), mutation_boost: 2.0}

  defp made(i) do
    cat = Catalog.get()
    {bp, _} = Random.blueprint(:rand.seed_s(:exsss, {i, 1, 1}), cat)

    Traits.species(bp, cat, %{id: "sp#{i}", code: "S#{i}", name: "G#{i}"})
    |> Map.merge(%{parent: nil, root: "sp#{i}", region: nil, born_ms: 0})
  end

  defp world(pop \\ 45) do
    Sim.new(%{
      population: pop,
      seed: 11,
      now_ms: 1_000,
      map: @map,
      creature_scale: 0.5,
      test_species: true,
      food: @food,
      catalog: Catalog.get(),
      mutation_boost: 2.0
    })
    |> Sim.add_species(made(1))
    |> Sim.add_species(made(2))
  end

  defp run(sim, n), do: Enum.reduce(1..n, sim, fn _, s -> Sim.step(s, 0.1) end)

  defp same?(a, b) do
    assert a.organisms == b.organisms
    assert :rand.export_seed_s(a.rng) == :rand.export_seed_s(b.rng)
    assert a.tick == b.tick and a.now_ms == b.now_ms
    assert a.flora == b.flora
    assert a.particles == b.particles
    assert a.genomes == b.genomes and a.extinct == b.extinct
  end

  test "ida e volta continua o mesmo mundo" do
    sim = run(world(), 300)
    assert {:ok, back} = sim |> Snapshot.encode() |> Snapshot.decode(@ctx)
    assert back.bounds.map == @map
    assert back.catalog == sim.catalog
    same?(run(sim, 100), run(back, 100))
  end

  test "regras diferentes recusam" do
    bin = world() |> Snapshot.encode() |> tamper(&%{&1 | rules_version: &1.rules_version + 1})
    assert Snapshot.decode(bin, @ctx) == {:error, :rules}
  end

  test "formato mais novo que o código recusa" do
    bin = world() |> Snapshot.encode() |> tamper(&%{&1 | format_version: &1.format_version + 1})
    assert Snapshot.decode(bin, @ctx) == {:error, :format}
    assert Snapshot.decode("lixo", @ctx) == {:error, :format}
  end

  test "mapa diferente recusa" do
    other = %{@map | id: "outro-mapa"}
    assert world() |> Snapshot.encode() |> Snapshot.decode(%{@ctx | map: other}) == {:error, :map}
  end

  test "formato antigo com campo a menos é completado" do
    sim = run(world(), 50)

    bin =
      sim
      |> Snapshot.encode()
      |> tamper(fn p ->
        orgs = Enum.map(p.sim.organisms, &Map.delete(&1, :sated_left))
        sim_map = p.sim |> Map.put(:organisms, orgs) |> Map.delete(:next_scan_ms)
        %{p | sim: sim_map}
      end)

    assert {:ok, back} = Snapshot.decode(bin, @ctx)
    assert Enum.all?(back.organisms, &match?(%Organism{sated_left: +0.0}, &1))
    assert back.next_scan_ms == %Sim{}.next_scan_ms
    assert %Sim{} = run(back, 10)
  end

  test "checksum é SHA-256 do binário" do
    bin = Snapshot.encode(world())
    assert Snapshot.checksum(bin) == :crypto.hash(:sha256, bin)
    assert byte_size(Snapshot.checksum(bin)) == 32
  end

  test "tamanho com 250 organismos" do
    sim = run(world(250), 20)
    {us, bin} = :timer.tc(fn -> Snapshot.encode(sim) end)
    {dus, {:ok, _}} = :timer.tc(fn -> Snapshot.decode(bin, @ctx) end)

    IO.puts(
      "\n[fotografia] #{length(sim.organisms)} organismos: #{byte_size(bin)} bytes, " <>
        "encode #{div(us, 1000)} ms, decode #{div(dus, 1000)} ms"
    )
  end

  # Abre o envelope, muda e fecha de novo (simula outra versão do código).
  defp tamper(bin, fun) do
    bin |> :erlang.binary_to_term() |> fun.() |> :erlang.term_to_binary([:compressed])
  end
end
