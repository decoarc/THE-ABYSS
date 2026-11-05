defmodule Abyss.World.LifeTest do
  use ExUnit.Case, async: true

  alias Abyss.World.{Life, Organism, Species}

  @eco Application.compile_env!(:abyss, :ecology) |> Map.new()
  @sp Species.get!(:celula)

  defp org(extra \\ []),
    do: struct!(%Organism{id: "T-1", species: :celula, born_ms: 0, pos: {0.0, 4.0, 0.0}}, extra)

  test "parado gasta metabolism por segundo" do
    assert_in_delta Life.drain(org(energy: 50.0), @sp, @eco, 1.0), 50.0 - @sp.metabolism, 1.0e-9
  end

  test "nadando no máximo gasta 2,5×" do
    o = org(energy: 50.0, vel: {@sp.max_speed, 0.0, 0.0})
    assert_in_delta Life.drain(o, @sp, @eco, 1.0), 50.0 - @sp.metabolism * 2.5, 1.0e-9
  end

  test "gain não passa do máximo" do
    assert Life.gain(org(energy: 95.0), @sp, 20.0).energy == @sp.energy_max
    assert_in_delta Life.gain(org(energy: 10.0), @sp, 20.0).energy, 30.0, 1.0e-9
  end

  test "jovem vira adulto em mature_s" do
    ms = round(@sp.mature_s * 1000)
    o = org(stage: :juvenile, stage_ms: 1000)
    assert Life.advance_stage(o, @sp, 1000 + ms - 100).stage == :juvenile
    a = Life.advance_stage(o, @sp, 1000 + ms)
    assert a.stage == :adult and a.stage_ms == 1000 + ms
  end

  test "jovem não morre de velhice" do
    o = org(stage: :juvenile, stage_ms: -10_000_000, energy: 50.0)
    assert Life.death_cause(o, @sp, 0) == nil
  end

  test "adulto morre de velhice" do
    life = round(@sp.adult_life_s * 1000)
    o = org(stage: :adult, stage_ms: 0, energy: 50.0)
    assert Life.death_cause(o, @sp, life - 1) == nil
    assert Life.death_cause(o, @sp, life) == :old_age
  end

  test "energia zero é fome, com prioridade sobre a velhice" do
    o = org(stage: :adult, stage_ms: -10_000_000, energy: 0.0)
    assert Life.death_cause(o, @sp, 0) == :starvation
  end

  test "raio do jovem" do
    adult = Life.radius(org(stage: :adult), @sp, 0.5, @eco)
    assert_in_delta adult, @sp.body_radius * 0.5, 1.0e-9
    assert_in_delta Life.radius(org(stage: :juvenile), @sp, 0.5, @eco), adult * 0.45, 1.0e-9
  end
end
