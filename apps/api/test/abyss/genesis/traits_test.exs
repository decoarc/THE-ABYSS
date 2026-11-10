defmodule Abyss.Genesis.TraitsTest do
  use ExUnit.Case, async: true

  alias Abyss.Genesis.{Blueprint, Catalog, Random, Traits}

  @fixtures "/shared/genesis/fixtures/blueprints.json"
  @meta %{id: "sp1", code: "S01", name: "Teste"}
  @num ~w(max_speed turn_rate burst perception escape metabolism body_radius mature_s adult_life_s)

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

  defp part(kind), do: part(kind, false)

  defp part(kind, mirror) do
    %{"kind" => kind, "at" => 0.5, "around" => 0.0, "size" => 1.0, "angle" => 0.0, "mirror" => mirror}
  end

  defp traits(bp, cat) do
    {:ok, norm} = Blueprint.validate(bp, cat)
    Traits.species(norm, cat, @meta)
  end

  test "fixtures: características batem", %{cat: cat} do
    fixtures = @fixtures |> File.read!() |> Jason.decode!()

    for %{"name" => name, "blueprint" => bp, "valid" => valid} = fx <- fixtures do
      if valid do
        expected = fx["traits"]
        assert is_map(expected), "fixture #{name} sem traits"
        sp = traits(bp, cat)

        for f <- @num do
          assert_in_delta sp[String.to_atom(f)], expected[f], 1.0e-9, "fixture #{name}: #{f}"
        end

        assert sp.school == expected["school"], "fixture #{name}: school"
        assert sp.shelter == expected["shelter"], "fixture #{name}: shelter"
        assert Atom.to_string(sp.diet) == expected["diet"], "fixture #{name}: diet"
      else
        assert expected_error = fx["error"], "fixture inválida #{name} sem error"
        assert {:error, errs} = Blueprint.validate(bp, cat)
        assert expected_error in errs, "fixture #{name}: #{inspect(errs)}"
      end
    end
  end

  test "campos completos e valores base", %{cat: cat} do
    sp = traits(base([part("raspador")]), cat)
    assert sp.id == "sp1" and sp.code == "S01" and sp.name == "Teste"
    assert sp.run_s == nil and sp.pause_s == nil
    assert sp.diet == :flora and sp.school == false and sp.shelter == false
    assert sp.max_speed == 0.15 and sp.escape == 0.0 and sp.wander == 0.3
    assert sp.sated_s == 12 and sp.energy_max == 100.0
    assert is_map(sp.blueprint)
  end

  test "cada peça muda alguma característica", %{cat: cat} do
    fields = ~w(max_speed turn_rate burst perception escape school shelter diet)a
    baseline = traits(base([part("raspador")]), cat)

    for kind <- Map.keys(cat.parts), cat.parts[kind].group != "boca" do
      sp = traits(base([part("raspador"), part(kind)]), cat)
      assert Enum.any?(fields, &(sp[&1] != baseline[&1])), "#{kind} só enfeita"
    end
  end

  test "cada boca define uma dieta distinta", %{cat: cat} do
    diets = for m <- ~w(raspador filtro mandibula), do: traits(base([part(m)]), cat).diet
    assert diets == [:flora, :particles, :predator]
  end

  test "placa freia e protege", %{cat: cat} do
    b = traits(base([part("raspador")]), cat)
    p = traits(base([part("raspador"), part("placa")]), cat)
    assert_in_delta p.escape, 0.15, 1.0e-12
    assert_in_delta p.max_speed, b.max_speed * 0.9, 1.0e-12
  end

  test "rendimento decrescente e tetos", %{cat: cat} do
    one = traits(base([part("raspador"), part("flagelo")]), cat)
    two = traits(base([part("raspador"), part("flagelo"), part("flagelo")]), cat)
    assert_in_delta one.max_speed, 0.15 + 0.12, 1.0e-12
    assert_in_delta two.max_speed, 0.15 + 0.12 + 0.12 * 0.7, 1.0e-12

    ocelos = traits(base([part("raspador"), part("ocelo", true), part("ocelo", true)]), cat)
    assert ocelos.perception <= 10.0
  end

  test "ninguém é o melhor em tudo", %{cat: cat} do
    st = :rand.seed_s(:exsss, {11, 22, 33})

    Enum.reduce(1..5000, st, fn _, st ->
      {bp, st} = Random.blueprint(st, cat)
      sp = traits(bp, cat)

      refute sp.max_speed >= 0.6 and sp.perception >= 8 and sp.burst >= 2.0 and sp.escape >= 0.3,
             "melhor em tudo: #{inspect(bp)}"

      st
    end)
  end
end
