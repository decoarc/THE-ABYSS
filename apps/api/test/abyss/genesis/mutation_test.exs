defmodule Abyss.Genesis.MutationTest do
  use ExUnit.Case, async: true

  alias Abyss.Genesis.{Blueprint, Catalog, Mutation, Random}

  setup_all do
    {:ok, cat: Catalog.get()}
  end

  defp mouths(bp, cat), do: Enum.count(bp["parts"], &(cat.parts[&1["kind"]].group == "boca"))

  defp planta(cat) do
    st = :rand.seed_s(:exsss, {7, 8, 9})
    {bp, _} = Random.blueprint(st, cat)
    bp
  end

  test "10 mil gerações encadeadas continuam válidas", %{cat: cat} do
    st = :rand.seed_s(:exsss, {1, 2, 3})

    {plantas, st} =
      Enum.map_reduce(1..20, st, fn _, st -> Random.blueprint(st, cat) end)

    Enum.reduce(plantas, st, fn bp, st ->
      Enum.reduce(1..500, {bp, st}, fn _, {bp, st} ->
        {filho, _mutated, st} = Mutation.child(bp, cat, st)
        assert {:ok, _} = Blueprint.validate(filho, cat, budget: false), inspect(filho)
        assert mouths(filho, cat) == 1
        assert byte_size(Jason.encode!(filho)) <= cat.max_bytes
        {filho, st}
      end)
      |> elem(1)
    end)
  end

  test "frequência de mutação de peça", %{cat: cat} do
    bp = planta(cat)
    m = cat.mutation
    n = 20_000

    {mutated, mouth_swaps, _} =
      Enum.reduce(1..n, {0, 0, :rand.seed_s(:exsss, {4, 5, 6})}, fn _, {c, ms, st} ->
        {filho, mut, st} = Mutation.child(bp, cat, st)

        swap =
          mut and
            Enum.find(filho["parts"], &(cat.parts[&1["kind"]].group == "boca"))["kind"] !=
              Enum.find(bp["parts"], &(cat.parts[&1["kind"]].group == "boca"))["kind"]

        {c + if(mut, do: 1, else: 0), ms + if(swap, do: 1, else: 0), st}
      end)

    assert_in_delta mutated / n, m.part_p, 0.01
    assert_in_delta mouth_swaps / n, m.part_p * m.mouth_share, 0.005
  end

  test "deriva não muda peças", %{cat: cat} do
    cat = %{cat | mutation: %{cat.mutation | part_p: 0, drift_p: 1}}
    bp = planta(cat)
    n = 1000

    {changed, _} =
      Enum.reduce(1..n, {0, :rand.seed_s(:exsss, {9, 9, 9})}, fn _, {c, st} ->
        {filho, mut, st} = Mutation.child(bp, cat, st)
        refute mut
        assert Blueprint.part_delta(bp, filho) == %{}
        diff = filho["colors"] != bp["colors"] or filho["body"] != bp["body"]
        {c + if(diff, do: 1, else: 0), st}
      end)

    assert changed / n > 0.9
  end

  test "determinística", %{cat: cat} do
    bp = planta(cat)
    st = :rand.seed_s(:exsss, {5, 5, 5})
    assert Mutation.child(bp, cat, st) == Mutation.child(bp, cat, st)
  end
end
