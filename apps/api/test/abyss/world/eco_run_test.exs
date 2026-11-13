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

  test "--genesis 3 --no-test-species com ramos no CSV, repetível" do
    args = ~w(--seed 3 --minutes 22 --genesis 3 --no-test-species --mutation-boost 12)
    csv = Mix.Tasks.Abyss.Eco.csv(args)
    assert csv == Mix.Tasks.Abyss.Eco.csv(args)

    [header | lines] = String.split(csv, "\n", trim: true)
    cols = String.split(header, ",")
    assert length(lines) == 22

    for c <- ~w(pop_sp1 pop_sp2 pop_sp3 branches_total trees_alive predators),
        do: assert(c in cols, "falta a coluna #{c}")

    # Só as criadas: nenhuma coluna das de teste; ramos não ganham coluna própria.
    assert Enum.filter(cols, &String.starts_with?(&1, "pop_")) == ~w(pop_sp1 pop_sp2 pop_sp3)

    rows = Enum.map(lines, &(cols |> Enum.zip(String.split(&1, ",")) |> Map.new()))
    int = fn r, c -> String.to_integer(r[c]) end
    last = List.last(rows)

    # Com o reforço de mutação, a semente 3 abre ramo dentro de 22 min.
    assert int.(last, "branches_total") > 0

    # pop_<raiz> soma a árvore inteira (raiz e ramos): a soma bate com o total.
    for r <- rows do
      trees = Enum.map(~w(pop_sp1 pop_sp2 pop_sp3), &int.(r, &1))
      assert Enum.sum(trees) == int.(r, "alive")
      assert int.(r, "trees_alive") == Enum.count(trees, &(&1 > 0))
    end
  end
end
