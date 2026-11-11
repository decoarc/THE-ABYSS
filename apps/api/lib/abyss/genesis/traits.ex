defmodule Abyss.Genesis.Traits do
  @moduledoc """
  Converte uma planta válida em características de espécie (`Species.t`).
  A ordem das contas é fixa (tipos em ordem alfabética, k crescente) para o
  cliente TypeScript reproduzir os mesmos números.
  """

  alias Abyss.Genesis.{Blueprint, Catalog}

  @numeric ~w(max_speed turn_rate burst perception escape)a

  @spec species(map, Catalog.t(), %{id: String.t(), code: String.t(), name: String.t()}) :: map
  def species(bp, cat, %{id: id, code: code, name: name}) do
    inst = bp |> Blueprint.instances() |> Enum.sort()
    radius = Blueprint.body_radius(bp, cat)

    num = Map.new(@numeric, &{&1, numeric(&1, inst, cat)})
    max_speed = speed_factor(num.max_speed, inst, cat)

    %{
      id: id,
      code: code,
      name: name,
      max_speed: max_speed,
      wander: cat.base.wander,
      turn_rate: num.turn_rate,
      body_radius: radius,
      run_s: nil,
      pause_s: nil,
      diet: diet(inst, cat),
      perception: num.perception,
      sated_s: cat.base.sated_s,
      school: flag(inst, cat, :school),
      shelter: flag(inst, cat, :shelter),
      burst: num.burst,
      energy_max: cat.base.energy_max,
      metabolism: metabolism(inst, radius, cat),
      mature_s: life(cat.life.mature_s, radius),
      adult_life_s: life(cat.life.adult_life_s, radius),
      escape: num.escape,
      blueprint: bp
    }
  end

  # base + Σ_k efeito × diminish^(k−1), depois limitado pelo teto.
  defp numeric(stat, inst, cat) do
    sum =
      Enum.reduce(inst, 0.0, fn {kind, n}, acc ->
        case cat.parts[kind] do
          %{effect: %{^stat => eff}} ->
            Enum.reduce(1..n//1, acc, fn k, a -> a + eff * :math.pow(cat.diminish, k - 1) end)

          _ ->
            acc
        end
      end)

    min(Map.fetch!(cat.base, stat) + sum, Map.fetch!(cat.caps, stat))
  end

  # speed_factor multiplica max_speed uma vez por instância, depois do teto.
  defp speed_factor(speed, inst, cat) do
    Enum.reduce(inst, speed, fn {kind, n}, acc ->
      case cat.parts[kind] do
        %{effect: %{speed_factor: f}} -> Enum.reduce(1..n//1, acc, fn _, a -> a * f end)
        _ -> acc
      end
    end)
  end

  defp metabolism(inst, radius, cat) do
    start = cat.metabolism.base + cat.metabolism.per_radius2 * radius * radius
    Enum.reduce(inst, start, fn {kind, n}, acc -> acc + cat.parts[kind].metab * n end)
  end

  defp life([a, b], radius), do: a + b * radius

  defp flag(inst, cat, key) do
    Enum.any?(inst, fn {kind, _} -> match?(%{effect: %{^key => true}}, cat.parts[kind]) end)
  end

  defp diet(inst, cat) do
    {kind, _} = Enum.find(inst, fn {kind, _} -> cat.parts[kind].group == "boca" end)

    case cat.parts[kind].diet do
      "flora" -> :flora
      "particles" -> :particles
      "predator" -> :predator
    end
  end
end
