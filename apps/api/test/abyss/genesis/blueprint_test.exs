defmodule Abyss.Genesis.BlueprintTest do
  use ExUnit.Case, async: true

  alias Abyss.Genesis.{Blueprint, Catalog, Random}

  @fixtures "/shared/genesis/fixtures/blueprints.json"

  setup_all do
    {:ok, cat: Catalog.get()}
  end

  defp base(parts) do
    %{
      "v" => 1,
      "body" => %{"spine" => [[-0.3, 0.0, 0.35], [0.0, 0.0, 0.45], [0.3, 0.0, 0.35]]},
      "parts" => parts,
      "colors" => %{"glow" => "#7fe9dd", "body" => "#3f5a4a"},
      "pattern" => "manchas"
    }
  end

  defp part(kind, mirror \\ false) do
    %{"kind" => kind, "at" => 0.5, "around" => 0.0, "size" => 1.0, "angle" => 0.0, "mirror" => mirror}
  end

  test "fixtures: validade e custo batem", %{cat: cat} do
    fixtures = @fixtures |> File.read!() |> Jason.decode!()
    assert length(fixtures) >= 8

    for %{"name" => name, "blueprint" => bp, "valid" => valid, "cost" => cost} <- fixtures do
      result = Blueprint.validate(bp, cat)

      if valid do
        assert {:ok, norm} = result, "fixture #{name}: #{inspect(result)}"
        assert Blueprint.cost(norm, cat) == cost, "fixture #{name}"
      else
        assert {:error, [_ | _]} = result, "fixture #{name}"
      end
    end
  end

  test "espelho conta duas instâncias e custo cresce", %{cat: cat} do
    {:ok, bp} = Blueprint.validate(base([part("raspador"), part("flagelo", true), part("flagelo", true)]), cat)
    assert Blueprint.instances(bp) == %{"raspador" => 1, "flagelo" => 4}
    # flagelo: 3 + 4 + 5 + 6 = 18; raspador: 2
    assert Blueprint.parts_cost(bp, cat) - 2 == 18
    assert Blueprint.cost(bp, cat) == Blueprint.parts_cost(bp, cat) + Blueprint.body_cost(bp, cat)

    {:ok, one} = Blueprint.validate(base([part("raspador"), part("flagelo", true)]), cat)
    assert Blueprint.cost(one, cat) < Blueprint.cost(bp, cat)
  end

  test "precisa de exatamente uma boca", %{cat: cat} do
    assert Blueprint.validate(base([]), cat) == {:error, ["precisa de exatamente uma boca"]}

    two = base([part("raspador"), part("filtro")])
    assert Blueprint.validate(two, cat) == {:error, ["precisa de exatamente uma boca"]}
  end

  test "lixo aleatório nunca valida nem quebra", %{cat: cat} do
    :rand.seed(:exsss, {1, 2, 3})
    valid = base([part("raspador")])

    for _ <- 1..2000 do
      assert {:error, _} = Blueprint.validate(garbage(valid), cat)
    end
  end

  test "planta aleatória sempre válida", %{cat: cat} do
    st = :rand.seed_s(:exsss, {42, 7, 99})

    Enum.reduce(1..2000, st, fn _, st ->
      {bp, st} = Random.blueprint(st, cat)
      assert {:ok, norm} = Blueprint.validate(bp, cat)
      assert Blueprint.cost(norm, cat) <= cat.budget
      st
    end)
  end

  test "plantas aleatórias têm corpos de tamanhos variados", %{cat: cat} do
    st = :rand.seed_s(:exsss, {5, 17, 71})

    {radii, _} =
      Enum.map_reduce(1..1000, st, fn _, st ->
        {bp, st} = Random.blueprint(st, cat)
        {:ok, norm} = Blueprint.validate(bp, cat)
        sp = Abyss.Genesis.Traits.species(norm, cat, %{id: "sp1", code: "S01", name: "T"})
        {sp.body_radius, st}
      end)

    assert Enum.count(radii, &(&1 < 0.9)) >= 250
    assert Enum.count(radii, &(&1 > 1.2)) >= 250
  end

  test "tamanho máximo", %{cat: cat} do
    big = put_in(base([part("raspador")]), ["colors", "glow"], String.duplicate("a", cat.max_bytes + 10))
    assert byte_size(Jason.encode!(big)) > cat.max_bytes
    assert Blueprint.validate(big, cat) == {:error, ["planta grande demais"]}
  end

  defp garbage(valid) do
    case :rand.uniform(9) do
      1 -> :rand.bytes(:rand.uniform(64))
      2 -> Enum.to_list(1..10_000)
      3 -> Map.put(valid, "extra", 1)
      4 -> put_in(valid, ["body", "spine"], [[:nan, "nan", 1]])
      5 -> %{"v" => "1", "body" => 5, "parts" => %{}, "colors" => [], "pattern" => 3}
      6 -> Map.put(valid, "parts", List.duplicate(%{"kind" => "raspador"}, 10_000))
      7 -> Map.put(valid, "v", "NaN")
      8 -> {:tuple, self(), make_ref()}
      9 -> Map.new(1..:rand.uniform(30), fn i -> {"k#{i}", :rand.bytes(4)} end)
    end
  end
end
