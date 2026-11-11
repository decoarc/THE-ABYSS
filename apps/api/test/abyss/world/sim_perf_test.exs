defmodule Abyss.World.SimPerfTest do
  # Síncrono: roda depois dos testes assíncronos, sozinho, para medir sem disputa.
  use ExUnit.Case, async: false

  alias Abyss.Genesis
  alias Abyss.Genesis.{Catalog, Random, Traits}
  alias Abyss.World.{Particles, Sim}
  alias Abyss.World.Map, as: WMap

  @moduletag timeout: 600_000

  @map WMap.load!("/shared/world/map-e1.json")
  @food Application.compile_env!(:abyss, :food) |> Map.new()
  @ecology Application.compile_env!(:abyss, :ecology) |> Map.new()
  @max_step_us 20_000
  # Teto de proteção do E2: 250 organismos, ciclo de vida e caça ligados.
  @population 250
  @seed 7
  # Comida farta só neste teste (Sim.boost_food/2), para o mundo se manter no teto.
  @boost 2.0
  # Mundo só com comida, antes de os fundadores entrarem: a flora enche
  # (flora_grow_s ÷ boost) e as partículas acumulam.
  @fill_s 120
  @steps 3000
  @floor 240

  # Fundadores como o Sim.new os faz (adultos, idade e energia variadas), num
  # mundo cuja comida já está cheia. O relógio dos fundadores é o do fim do
  # enchimento, então nenhuma idade é zerada nem deslocada.
  defp mature_at_cap(population \\ @population) do
    food = Sim.boost_food(@food, @boost)

    base = %{
      population: population,
      seed: @seed,
      now_ms: 0,
      map: @map,
      creature_scale: 0.5,
      test_species: false,
      food: food,
      ecology: @ecology
    }

    filled =
      Enum.reduce(1..(@fill_s * 2), Sim.new(base), fn _, s -> Sim.step(s, 0.5) end)

    sim = Sim.new(%{base | test_species: true, now_ms: filled.now_ms})
    %{sim | flora: filled.flora, particles: filled.particles}
  end

  # S1: `count` espécies criadas, as mesmas plantas do `mix abyss.seed_species --count N --seed 7`
  # (Genesis.seed!), com 3 fundadoras cada, e as de teste completando o teto.
  defp created_at_cap(count) do
    cat = Catalog.get()
    sim = mature_at_cap(@population - 3 * count)

    {sim, _} =
      Enum.reduce(1..count, {sim, :rand.seed_s(:exsss, {@seed, 7, 7})}, fn i, {sim, rng} ->
        {bp, rng} = Random.blueprint(rng, cat)

        sp =
          Traits.species(bp, cat, %{id: "sp#{i}", code: Genesis.code_for(i), name: "Semente #{i}"})

        {Sim.add_species(sim, sp), rng}
      end)

    # As fundadoras entram no passo seguinte ao registro.
    Sim.step(sim, 0.1)
  end

  # Passa `@steps` ticks medindo cada um: {final, tempos, populações}.
  defp measure(sim) do
    :erlang.garbage_collect()

    Enum.reduce(1..@steps, {sim, [], []}, fn _, {s, acc, pops} ->
      {us, s} = :timer.tc(fn -> Sim.step(s, 0.1) end)
      {s, [us | acc], [length(s.organisms) | pops]}
    end)
  end

  test "3000 ticks com 250 organismos maduros no teto e o ciclo acontecendo: passo máximo <= 20 ms" do
    sim = mature_at_cap()
    orgs = sim.organisms

    assert length(orgs) == @population
    assert Enum.all?(orgs, &(&1.stage == :adult))
    assert orgs |> Enum.map(& &1.stage_ms) |> Enum.uniq() |> length() > 200
    assert orgs |> Enum.map(& &1.energy) |> Enum.uniq() |> length() > 200

    before = Sim.eco_stats(sim)
    {final, times, pops} = measure(sim)

    now = Sim.eco_stats(final)
    births = now.births_total - before.births_total
    deaths = now.deaths_total |> Map.values() |> Enum.sum()
    deaths = deaths - (before.deaths_total |> Map.values() |> Enum.sum())
    hunts = now.hunts_ok - before.hunts_ok

    sorted = Enum.sort(times)
    max = List.last(sorted)
    p99 = Enum.at(sorted, ceil(@steps * 0.99) - 1)
    mean = div(Enum.sum(sorted), @steps)
    min_pop = Enum.min(pops)
    at_floor = Enum.count(pops, &(&1 >= @floor))

    IO.puts(
      "\n[sim perf] #{@steps} ticks, boost #{@boost}, #{Particles.count(sim.particles)} partículas no início: " <>
        "média #{mean} us, p99 #{p99} us, máx #{max} us; nascimentos #{births}, mortes #{deaths} " <>
        "(#{inspect(Map.new(now.deaths_total, fn {c, n} -> {c, n - before.deaths_total[c]} end))}), " <>
        "caças #{hunts}; população mín #{min_pop}, final #{length(final.organisms)}, " <>
        ">= #{@floor} em #{at_floor}/#{@steps} ticks"
    )

    assert births > 0
    assert deaths > 0
    assert hunts > 0
    assert Enum.max(pops) <= @population
    # A maior parte do tempo no teto (ou a uma divisão dele).
    assert at_floor >= @steps * 0.9
    assert max <= @max_step_us
  end

  test "S1: 50 espécies criadas diferentes (150 fundadoras) e as de teste no teto: passo máximo <= 20 ms" do
    sim = created_at_cap(50)
    orgs = sim.organisms
    created = Enum.filter(orgs, &is_binary(&1.species))

    assert length(orgs) == @population
    assert length(created) == 150
    assert created |> Enum.map(& &1.species) |> Enum.uniq() |> length() == 50
    assert sim.bounds.hunted == :all

    before = Sim.eco_stats(sim)
    {final, times, pops} = measure(sim)

    now = Sim.eco_stats(final)
    births = now.births_total - before.births_total
    hunts = now.hunts_ok - before.hunts_ok
    escaped = now.hunts_escaped - before.hunts_escaped

    alive =
      final.organisms
      |> Enum.filter(&is_binary(&1.species))
      |> Enum.map(& &1.species)
      |> Enum.uniq()

    sorted = Enum.sort(times)
    max = List.last(sorted)
    p99 = Enum.at(sorted, ceil(@steps * 0.99) - 1)
    mean = div(Enum.sum(sorted), @steps)
    at_floor = Enum.count(pops, &(&1 >= @floor))

    IO.puts(
      "
[sim perf S1] #{@steps} ticks, 50 criadas + teste, boost #{@boost}: " <>
        "média #{mean} us, p99 #{p99} us, máx #{max} us; nascimentos #{births}, caças #{hunts}, " <>
        "escapes #{escaped}; população mín #{Enum.min(pops)}, final #{length(final.organisms)}, " <>
        ">= #{@floor} em #{at_floor}/#{@steps} ticks; criadas vivas no fim #{length(alive)}/50"
    )

    assert births > 0
    assert Enum.max(pops) <= @population
    assert at_floor >= @steps * 0.9
    assert max <= @max_step_us
  end
end
