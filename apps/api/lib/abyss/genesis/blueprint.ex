defmodule Abyss.Genesis.Blueprint do
  @moduledoc """
  Planta (blueprint v1) da criatura: validação manual, custo e instâncias.
  A planta normalizada tem chaves string e floats (pronta para jsonb e fio).
  """

  alias Abyss.Genesis.Catalog

  @color ~r/\A#[0-9a-f]{6}\z/
  @top_keys ~w(v body parts colors pattern)
  @part_keys ~w(kind at around size angle mirror)

  @spec validate(term, Catalog.t()) :: {:ok, map} | {:error, [String.t()]}
  def validate(term, cat) do
    do_validate(term, cat)
  rescue
    _ -> {:error, ["planta inválida"]}
  catch
    _, _ -> {:error, ["planta inválida"]}
  end

  defp do_validate(term, cat) do
    cond do
      not is_map(term) ->
        {:error, ["planta inválida"]}

      :erlang.external_size(term) > cat.max_bytes * 4 ->
        {:error, ["planta grande demais"]}

      too_big_json?(term, cat.max_bytes) ->
        {:error, ["planta grande demais"]}

      true ->
        check(term, cat)
    end
  end

  defp too_big_json?(term, max) do
    case Jason.encode(term) do
      {:ok, json} -> byte_size(json) > max
      _ -> false
    end
  end

  defp check(term, cat) do
    extra = Map.keys(term) -- @top_keys
    missing = @top_keys -- Map.keys(term)

    cond do
      extra != [] or missing != [] ->
        {:error, ["formato da planta inválido"]}

      term["v"] != 1 ->
        {:error, ["versão da planta desconhecida"]}

      true ->
        with {:ok, spine} <- check_spine(term["body"], cat),
             {:ok, parts} <- check_parts(term["parts"], cat),
             {:ok, colors} <- check_colors(term["colors"]),
             {:ok, pattern} <- check_pattern(term["pattern"], cat) do
          bp = %{
            "v" => 1,
            "body" => %{"spine" => spine},
            "parts" => parts,
            "colors" => colors,
            "pattern" => pattern
          }

          check_totals(bp, cat)
        end
    end
  end

  # ---- corpo ----

  defp check_spine(%{"spine" => spine} = body, cat) when map_size(body) == 1 and is_list(spine) do
    [pmin, pmax] = cat.body.points

    if length(spine) < pmin or length(spine) > pmax do
      {:error, ["espinha precisa de #{pmin} a #{pmax} pontos"]}
    else
      pts = Enum.map(spine, &point/1)

      if Enum.any?(pts, &(&1 == :error)) do
        {:error, ["ponto da espinha inválido"]}
      else
        check_spine_rules(pts, cat)
      end
    end
  end

  defp check_spine(_, _), do: {:error, ["corpo inválido"]}

  defp point([x, y, r]) when is_number(x) and is_number(y) and is_number(r),
    do: [x * 1.0, y * 1.0, r * 1.0]

  defp point(_), do: :error

  defp check_spine_rules(pts, cat) do
    [rmin, rmax] = cat.body.r
    xs = Enum.map(pts, &hd/1)
    increasing = xs |> Enum.chunk_every(2, 1, :discard) |> Enum.all?(fn [a, b] -> b > a end)

    errs =
      []
      |> add(not increasing, "espinha precisa de x crescente")
      |> add(increasing and List.last(xs) - hd(xs) > cat.body.length_max, "corpo comprido demais")
      |> add(Enum.any?(pts, fn [_, y, _] -> abs(y) > cat.body.bend_max end), "espinha curva demais")
      |> add(Enum.any?(pts, fn [_, _, r] -> r < rmin or r > rmax end), "raio da espinha fora da faixa")

    if errs == [], do: {:ok, pts}, else: {:error, Enum.reverse(errs)}
  end

  # ---- peças ----

  defp check_parts(parts, cat) when is_list(parts) do
    if length(parts) > cat.parts_max do
      {:error, ["peças demais"]}
    else
      results = Enum.map(parts, &check_part(&1, cat))

      case Enum.filter(results, &match?({:error, _}, &1)) do
        [] -> {:ok, Enum.map(results, fn {:ok, p} -> p end)}
        errs -> {:error, errs |> Enum.map(fn {:error, e} -> e end) |> Enum.uniq()}
      end
    end
  end

  defp check_parts(_, _), do: {:error, ["peças inválidas"]}

  defp check_part(%{"kind" => kind} = part, cat) when is_binary(kind) do
    spec = Map.get(cat.parts, kind)
    [smin, smax] = cat.part_size
    [amin, amax] = cat.part_angle
    pi = :math.pi()

    cond do
      Enum.sort(Map.keys(part)) != Enum.sort(@part_keys) ->
        {:error, "peça com formato inválido"}

      spec == nil ->
        {:error, "peça fora do catálogo"}

      not in_range?(part["at"], 0, 1) ->
        {:error, "posição da peça fora de 0 a 1"}

      not in_range?(part["around"], -pi, pi) ->
        {:error, "ângulo em volta fora da faixa"}

      not in_range?(part["size"], smin, smax) ->
        {:error, "tamanho da peça fora da faixa"}

      not in_range?(part["angle"], amin, amax) ->
        {:error, "inclinação da peça fora da faixa"}

      not is_boolean(part["mirror"]) ->
        {:error, "espelho da peça inválido"}

      part["mirror"] and not spec.mirror ->
        {:error, "peça não pode ser espelhada"}

      true ->
        {:ok,
         %{
           "kind" => kind,
           "at" => part["at"] * 1.0,
           "around" => part["around"] * 1.0,
           "size" => part["size"] * 1.0,
           "angle" => part["angle"] * 1.0,
           "mirror" => part["mirror"]
         }}
    end
  end

  defp check_part(_, _), do: {:error, "peça com formato inválido"}

  defp in_range?(v, lo, hi), do: is_number(v) and v >= lo and v <= hi

  # ---- cores e padrão ----

  defp check_colors(%{"glow" => g, "body" => b} = c) when map_size(c) == 2 do
    if color?(g) and color?(b),
      do: {:ok, %{"glow" => g, "body" => b}},
      else: {:error, ["cor inválida"]}
  end

  defp check_colors(_), do: {:error, ["cores inválidas"]}

  defp color?(s), do: is_binary(s) and Regex.match?(@color, s)

  defp check_pattern(p, cat) do
    if is_binary(p) and p in cat.patterns, do: {:ok, p}, else: {:error, ["padrão inválido"]}
  end

  # ---- totais (boca, máximos, orçamento) ----

  defp check_totals(bp, cat) do
    inst = instances(bp)

    mouths =
      inst
      |> Enum.filter(fn {k, _} -> cat.parts[k].group == "boca" end)
      |> Enum.map(&elem(&1, 1))
      |> Enum.sum()

    over_max = Enum.any?(inst, fn {k, n} -> n > cat.parts[k].max end)
    total = inst |> Map.values() |> Enum.sum()

    errs =
      []
      |> add(mouths != 1, "precisa de exatamente uma boca")
      |> add(over_max, "peça repetida além do máximo")
      |> add(total > cat.parts_max, "peças demais")

    errs =
      if errs == [] and cost(bp, cat) > cat.budget,
        do: ["estoura o orçamento"],
        else: Enum.reverse(errs)

    if errs == [], do: {:ok, bp}, else: {:error, errs}
  end

  defp add(errs, true, msg), do: [msg | errs]
  defp add(errs, false, _), do: errs

  # ---- conta ----

  @doc "Instâncias por tipo; peça espelhada conta 2."
  @spec instances(map) :: %{String.t() => pos_integer}
  def instances(%{"parts" => parts}) do
    Enum.reduce(parts, %{}, fn %{"kind" => k, "mirror" => m}, acc ->
      Map.update(acc, k, if(m, do: 2, else: 1), &(&1 + if(m, do: 2, else: 1)))
    end)
  end

  @doc "Custo total: peças mais corpo."
  @spec cost(map, Catalog.t()) :: non_neg_integer
  def cost(bp, cat), do: parts_cost(bp, cat) + body_cost(bp, cat)

  @doc "Custo só das peças (a k-ésima instância custa cost + step × (k − 1))."
  @spec parts_cost(map, Catalog.t()) :: non_neg_integer
  def parts_cost(bp, cat) do
    bp
    |> instances()
    |> Enum.map(fn {kind, n} ->
      %{cost: c, step: s} = cat.parts[kind]
      Enum.sum(for k <- 1..n//1, do: c + s * (k - 1))
    end)
    |> Enum.sum()
  end

  @spec body_cost(map, Catalog.t()) :: non_neg_integer
  def body_cost(bp, cat), do: ceil(cat.body.cost_per_radius * body_radius(bp, cat))

  @doc "Raio da esfera que envolve o corpo, limitado a `body.radius` (mínimo e máximo)."
  @spec body_radius(map, Catalog.t()) :: float
  def body_radius(%{"body" => %{"spine" => spine}}, cat) do
    n = length(spine)
    cx = Enum.sum(for [x, _, _] <- spine, do: x) / n
    cy = Enum.sum(for [_, y, _] <- spine, do: y) / n

    raw =
      spine
      |> Enum.map(fn [x, y, r] -> :math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) + r end)
      |> Enum.max()

    [rmin, rmax] = cat.body.radius
    raw |> max(rmin * 1.0) |> min(rmax * 1.0)
  end
end
