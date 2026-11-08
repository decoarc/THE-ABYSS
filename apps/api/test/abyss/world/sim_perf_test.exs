defmodule Abyss.World.SimPerfTest do
  # Síncrono: roda depois dos testes assíncronos, sozinho, para medir sem disputa.
  use ExUnit.Case, async: false

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
  defp mature_at_cap do
    food = Sim.boost_food(@food, @boost)

    base = %{
      population: @population,
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

  test "3000 ticks com 250 organismos maduros no teto e o ciclo acontecendo: passo máximo <= 20 ms" do
    sim = mature_at_cap()
    orgs = sim.organisms

    assert length(orgs) == @population
    assert Enum.all?(orgs, &(&1.stage == :adult))
    assert orgs |> Enum.map(& &1.stage_ms) |> Enum.uniq() |> length() > 200
    assert orgs |> Enum.map(& &1.energy) |> Enum.uniq() |> length() > 200

    before = Sim.eco_stats(sim)
    :erlang.garbage_collect()

    {final, times, pops} =
      Enum.reduce(1..@steps, {sim, [], []}, fn _, {s, acc, pops} ->
        {us, s} = :timer.tc(fn -> Sim.step(s, 0.1) end)
        {s, [us | acc], [length(s.organisms) | pops]}
      end)

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
end
