defmodule Abyss.EcoRunTest do
  use ExUnit.Case, async: true

  alias Abyss.Eco

  @moduletag timeout: 300_000

  test "mesma semente, mesmo resultado" do
    a = Eco.run(seed: 7, minutes: 10)
    assert length(a) == 10
    assert a == Eco.run(seed: 7, minutes: 10)
    assert a != Eco.run(seed: 8, minutes: 10)
  end

  test "cadeia de teste acontece" do
    rows = Eco.run(seed: 7, minutes: 30)
    sum = fn f -> rows |> Enum.map(f) |> Enum.sum() end

    assert sum.(& &1.deaths.predation) > 0
    assert sum.(& &1.births) > 0
    assert sum.(&(&1.deaths.starvation + &1.deaths.old_age)) > 0
    assert sum.(& &1.hunts_ok) > 0
    assert Enum.all?(rows, &(&1.hunts_escaped >= 0))
  end

  test "--genesis 5 roda 10 min sem erro e é repetível" do
    a = Eco.run(seed: 7, minutes: 10, genesis: 5)
    assert length(a) == 10
    assert Map.has_key?(hd(a).pop, "sp5")
    assert a == Eco.run(seed: 7, minutes: 10, genesis: 5)
  end
end
