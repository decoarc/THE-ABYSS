defmodule Abyss.Genesis.Random do
  @moduledoc "Gera plantas aleatórias sempre válidas e dentro do orçamento."

  alias Abyss.Genesis.{Blueprint, Catalog}

  # Classes de tamanho do corpo (comprimento da espinha, raio `r` dos pontos, curvatura relativa).
  @len %{small: [0.5, 0.9], medium: [1.0, 1.6], large: [2.4, 4.0]}
  @r %{small: [0.12, 0.35], medium: [0.25, 0.5], large: [0.5, 0.9]}
  @bend %{small: 0.3, medium: 0.6, large: 1.0}

  @spec blueprint(:rand.state(), Catalog.t()) :: {map, :rand.state()}
  def blueprint(st, cat) do
    {n, st} = int(st, cat.body.points)
    {class, st} = pick(st, [:small, :medium, :large])
    {len, st} = float(st, clamp(@len[class], [0.5, cat.body.length_max]))
    x0 = -len / 2
    bend = min(cat.body.bend_max, 0.6) * @bend[class]
    [rmin, rmax] = cat.body.r
    [rlo, rhi] = clamp(@r[class], [rmin, rmax])

    {spine, st} =
      Enum.map_reduce(0..(n - 1), st, fn i, st ->
        {y, st} = float(st, [-bend, bend])
        {r, st} = float(st, [rlo, rhi])
        {[r3(x0 + len * i / (n - 1)), r3(y), r3(r)], st}
      end)

    mouths = kinds(cat, &(&1.group == "boca"))
    others = kinds(cat, &(&1.group != "boca"))

    {mouth, st} = pick(st, mouths)
    {mpart, st} = part(st, cat, mouth, false, 1.0)
    bp = %{"v" => 1, "body" => %{"spine" => spine}, "parts" => [mpart]}

    {attempts, st} = int(st, [0, cat.parts_max * 2])
    {bp, st} = Enum.reduce(1..attempts//1, {bp, st}, fn _, {bp, st} -> try_add(bp, st, cat, others) end)

    {glow, st} = hex(st)
    {body, st} = hex(st)
    {pattern, st} = pick(st, cat.patterns)

    {Map.merge(bp, %{"colors" => %{"glow" => glow, "body" => body}, "pattern" => pattern}), st}
  end

  defp clamp([lo, hi], [min, max]), do: [max(lo, min) * 1.0, min(hi, max) * 1.0]

  defp kinds(cat, fun) do
    cat.parts |> Enum.filter(fn {_, s} -> fun.(s) end) |> Enum.map(&elem(&1, 0)) |> Enum.sort()
  end

  defp try_add(bp, st, cat, others) do
    {kind, st} = pick(st, others)
    {coin, st} = :rand.uniform_s(st)
    mirror = cat.parts[kind].mirror and coin < 0.5
    {at, st} = float(st, [0.0, 1.0])
    {p, st} = part(st, cat, kind, mirror, r3(at))
    cand = %{bp | "parts" => bp["parts"] ++ [p]}
    inst = Blueprint.instances(cand)

    ok =
      Enum.all?(inst, fn {k, n} -> n <= cat.parts[k].max end) and
        Enum.sum(Map.values(inst)) <= cat.parts_max and
        Blueprint.cost(cand, cat) <= cat.budget

    {if(ok, do: cand, else: bp), st}
  end

  defp part(st, cat, kind, mirror, at) do
    {around, st} = float(st, [-3.1, 3.1])
    {size, st} = float(st, cat.part_size)
    {angle, st} = float(st, cat.part_angle)

    {%{
       "kind" => kind,
       "at" => at,
       "around" => r3(around),
       "size" => r3(size),
       "angle" => r3(angle),
       "mirror" => mirror
     }, st}
  end

  defp hex(st) do
    {n, st} = :rand.uniform_s(0x1000000, st)
    {"#" <> (Integer.to_string(n - 1, 16) |> String.pad_leading(6, "0") |> String.downcase()), st}
  end

  defp pick(st, list) do
    {i, st} = :rand.uniform_s(length(list), st)
    {Enum.at(list, i - 1), st}
  end

  defp int(st, [lo, hi]) do
    {i, st} = :rand.uniform_s(hi - lo + 1, st)
    {lo + i - 1, st}
  end

  defp float(st, [lo, hi]) do
    {f, st} = :rand.uniform_s(st)
    {lo + f * (hi - lo), st}
  end

  defp r3(f), do: Float.round(f * 1.0, 3)
end
