defmodule Abyss.Genesis.Mutation do
  @moduledoc """
  Mutação da planta no nascimento (gate S2). Pura: recebe e devolve o estado
  do `:rand`. Duas partes independentes: mutação de peça (add/remove/swap/boca)
  e deriva de corpo e cor. O resultado respeita sempre os limites estruturais
  (o orçamento pode estourar).
  """

  alias Abyss.Genesis.{Blueprint, Catalog}

  @pi :math.pi()

  @spec child(map, Catalog.t(), :rand.state()) :: {map, boolean, :rand.state()}
  def child(bp, cat, st) do
    m = cat.mutation
    {u, st} = :rand.uniform_s(st)

    {bp, mutated, st} =
      if u < m.part_p do
        case mutate_part(bp, cat, st) do
          {nil, st} -> {bp, false, st}
          {new, st} -> {new, true, st}
        end
      else
        {bp, false, st}
      end

    {d, st} = :rand.uniform_s(st)

    if d < m.drift_p do
      {bp, st} = drift(bp, cat, st)
      {bp, mutated, st}
    else
      {bp, mutated, st}
    end
  end

  # ---- peças ----

  defp mutate_part(bp, cat, st) do
    m = cat.mutation
    {u, st} = :rand.uniform_s(st)

    if u < m.mouth_share do
      swap_mouth(bp, cat, st)
    else
      {v, st} = :rand.uniform_s(st)
      %{add: a, remove: r} = m.ops
      total = a + r + m.ops.swap
      x = v * total

      cond do
        x < a -> add_part(bp, cat, st)
        x < a + r -> remove_part(bp, cat, st)
        true -> swap_part(bp, cat, st)
      end
    end
  end

  defp kinds(cat, mouth?) do
    Enum.sort(for {k, s} <- cat.parts, (s.group == "boca") == mouth?, do: k)
  end

  defp swap_mouth(bp, cat, st) do
    idx = bp["parts"] |> Enum.find_index(&(cat.parts[&1["kind"]].group == "boca"))
    current = Enum.at(bp["parts"], idx)["kind"]
    case pick(st, kinds(cat, true) -- [current]) do
      {nil, st} -> {nil, st}
      {kind, st} -> {finish(bp, cat, List.update_at(bp["parts"], idx, &%{&1 | "kind" => kind})), st}
    end
  end

  defp add_part(bp, cat, st) do
    case pick(st, kinds(cat, false)) do
      {nil, st} -> {nil, st}
      {kind, st} -> add_part(bp, cat, kind, st)
    end
  end

  defp add_part(bp, cat, kind, st) do
    {coin, st} = :rand.uniform_s(st)
    {at, st} = float(st, 0.0, 1.0)
    {around, st} = float(st, -@pi, @pi)
    {size, st} = float(st, hd(cat.part_size), List.last(cat.part_size))
    {angle, st} = float(st, hd(cat.part_angle), List.last(cat.part_angle))

    part = %{
      "kind" => kind,
      "at" => at,
      "around" => around,
      "size" => size,
      "angle" => angle,
      "mirror" => cat.parts[kind].mirror and coin < 0.5
    }

    {finish(bp, cat, bp["parts"] ++ [part]), st}
  end

  defp remove_part(bp, cat, st) do
    idxs = non_mouth_idxs(bp, cat)

    if idxs == [] do
      {nil, st}
    else
      {i, st} = pick(st, idxs)
      {finish(bp, cat, List.delete_at(bp["parts"], i)), st}
    end
  end

  defp swap_part(bp, cat, st) do
    idxs = non_mouth_idxs(bp, cat)

    if idxs == [] do
      {nil, st}
    else
      {i, st} = pick(st, idxs)
      old = Enum.at(bp["parts"], i)
      case pick(st, kinds(cat, false) -- [old["kind"]]) do
        {nil, st} ->
          {nil, st}

        {kind, st} ->
          mirror = old["mirror"] and cat.parts[kind].mirror
          new = %{old | "kind" => kind, "mirror" => mirror}
          {finish(bp, cat, List.replace_at(bp["parts"], i, new)), st}
      end
    end
  end

  defp non_mouth_idxs(bp, cat) do
    for {p, i} <- Enum.with_index(bp["parts"]), cat.parts[p["kind"]].group != "boca", do: i
  end

  # Aplica a lista de peças se respeita os limites estruturais; senão nil.
  defp finish(bp, cat, parts) do
    cand = %{bp | "parts" => Enum.map(parts, &round_part/1)}

    case Blueprint.validate(cand, cat, budget: false) do
      {:ok, _} -> cand
      _ -> nil
    end
  end

  defp round_part(p) do
    Enum.reduce(~w(at around size angle), p, fn k, acc -> Map.update!(acc, k, &r3/1) end)
  end

  # ---- deriva ----

  defp drift(bp, cat, st) do
    d = cat.mutation.drift
    {spine, st} = drift_spine(bp["body"]["spine"], cat, d, st)
    {glow, st} = drift_hue(bp["colors"]["glow"], d.hue, st)
    {body, st} = drift_hue(bp["colors"]["body"], d.hue, st)
    {u, st} = :rand.uniform_s(st)

    {pattern, st} =
      if u < d.pattern_p,
        do: pick(st, cat.patterns -- [bp["pattern"]]),
        else: {bp["pattern"], st}

    pattern = pattern || bp["pattern"]

    bp = %{
      bp
      | "body" => %{bp["body"] | "spine" => spine},
        "colors" => %{"glow" => glow, "body" => body},
        "pattern" => pattern
    }

    {bp, st}
  end

  defp drift_spine(spine, cat, d, st) do
    [rmin, rmax] = cat.body.r
    bend = cat.body.bend_max
    n = length(spine)

    {_, acc, st} =
      Enum.reduce(0..(n - 1), {spine, [], st}, fn i, {cur, acc, st} ->
        [x, y, r] = Enum.at(cur, i)
        {dx, st} = float(st, -d.spine_xy, d.spine_xy)
        {dy, st} = float(st, -d.spine_xy, d.spine_xy)
        {dr, st} = float(st, -d.spine_r, d.spine_r)
        nx = r3(x + dx)
        ny = r3(clamp(y + dy, -bend, bend))
        nr = r3(clamp(r + dr, rmin, rmax))
        cand = List.replace_at(cur, i, [nx, ny, nr])
        xs = Enum.map(cand, &hd/1)

        ok =
          xs |> Enum.chunk_every(2, 1, :discard) |> Enum.all?(fn [a, b] -> b > a end) and
            List.last(xs) - hd(xs) <= cat.body.length_max

        next = if ok, do: cand, else: cur
        {next, [Enum.at(next, i) | acc], st}
      end)

    {Enum.reverse(acc), st}
  end

  defp drift_hue(hex, amount, st) do
    {delta, st} = float(st, -amount, amount)
    {h, s, l} = hex |> to_rgb() |> rgb_to_hsl()
    {from_rgb(hsl_to_rgb({h + delta, s, l})), st}
  end

  defp to_rgb("#" <> <<r::binary-2, g::binary-2, b::binary-2>>) do
    {String.to_integer(r, 16) / 255, String.to_integer(g, 16) / 255, String.to_integer(b, 16) / 255}
  end

  defp from_rgb({r, g, b}) do
    "#" <>
      Enum.map_join([r, g, b], fn c ->
        c |> Kernel.*(255) |> round() |> max(0) |> min(255) |> Integer.to_string(16) |> String.pad_leading(2, "0") |> String.downcase()
      end)
  end

  defp rgb_to_hsl({r, g, b}) do
    mx = max(r, max(g, b))
    mn = min(r, min(g, b))
    l = (mx + mn) / 2
    d = mx - mn

    if d == 0 do
      {0.0, 0.0, l}
    else
      s = d / (1 - abs(2 * l - 1))

      h =
        cond do
          mx == r -> rem_f((g - b) / d, 6)
          mx == g -> (b - r) / d + 2
          true -> (r - g) / d + 4
        end

      {h / 6, s, l}
    end
  end

  defp rem_f(a, m), do: a - m * Float.floor(a / m)

  defp hsl_to_rgb({h, s, l}) do
    h = h - Float.floor(h)
    c = (1 - abs(2 * l - 1)) * s
    hp = h * 6
    x = c * (1 - abs(rem_f(hp, 2) - 1))
    m = l - c / 2

    {r, g, b} =
      cond do
        hp < 1 -> {c, x, 0.0}
        hp < 2 -> {x, c, 0.0}
        hp < 3 -> {0.0, c, x}
        hp < 4 -> {0.0, x, c}
        hp < 5 -> {x, 0.0, c}
        true -> {c, 0.0, x}
      end

    {r + m, g + m, b + m}
  end

  # ---- sorteio ----

  # Lista vazia (catálogo com uma só opção): nada a sortear, e o rng fica intacto.
  defp pick(st, []), do: {nil, st}

  defp pick(st, list) do
    {i, st} = :rand.uniform_s(length(list), st)
    {Enum.at(list, i - 1), st}
  end

  defp float(st, lo, hi) do
    {f, st} = :rand.uniform_s(st)
    {lo + f * (hi - lo), st}
  end

  defp clamp(v, lo, hi), do: v |> max(lo) |> min(hi)
  defp r3(f), do: Float.round(f * 1.0, 3)
end
