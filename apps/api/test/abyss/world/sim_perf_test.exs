defmodule Abyss.World.SimPerfTest do
  # Síncrono: roda depois dos testes assíncronos, sozinho, para medir sem disputa.
  use ExUnit.Case, async: false

  alias Abyss.World.{Particles, Sim}
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @food Application.compile_env!(:abyss, :food) |> Map.new()
  @max_step_us 20_000
  # Teto de proteção do E2: 250 organismos, ciclo de vida e caça ligados.
  @population 250

  # 250 organismos (o teto) com a comida no teto: flora_grow_s + 10 s de mundo sem
  # organismos (taxa de partículas dobrada para encher as 400) e depois a
  # população de volta.
  defp at_caps do
    sim =
      Sim.new(%{
        population: @population,
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

    filled =
      Enum.reduce(1..round((@food.flora_grow_s + 10) * 2), fill, fn _, s -> Sim.step(s, 0.5) end)

    %{filled | organisms: sim.organisms, particles: %{filled.particles | cfg: @food}}
  end

  test "600 ticks com 250 organismos e comida no teto: passo máximo <= 20 ms" do
    sim = at_caps()
    assert Particles.count(sim.particles) >= 380
    assert Enum.all?(Tuple.to_list(sim.flora.patches), &(&1.level == 1.0))

    {final, times} =
      Enum.reduce(1..600, {sim, []}, fn _, {s, acc} ->
        {us, s} = :timer.tc(fn -> Sim.step(s, 0.1) end)
        {s, [us | acc]}
      end)

    sorted = Enum.sort(times)
    max = List.last(sorted)
    p99 = Enum.at(sorted, 593)
    mean = div(Enum.sum(sorted), 600)

    IO.puts(
      "\n[sim perf] 600 ticks, #{@population} organismos, #{Particles.count(sim.particles)} partículas: " <>
        "população final #{length(final.organisms)}, média #{mean} us, p99 #{p99} us, máx #{max} us"
    )

    assert length(sim.organisms) == @population
    assert length(final.organisms) <= 250
    assert max <= @max_step_us
  end
end
