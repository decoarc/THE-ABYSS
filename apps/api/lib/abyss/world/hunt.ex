defmodule Abyss.World.Hunt do
  @moduledoc """
  Regras puras de predação, fuga, abrigo e cardume. Tudo sai das
  características (`diet`, `perception`, `burst`, `shelter`, `school`) e do
  porte (raio efetivo); nenhuma regra testa o id ou o nome de uma espécie.

  A grade de organismos (`Abyss.World.Grid`) é a do passo, com itens
  `{i, id, pos, r, species_id, vel, energy}` tirados do começo do passo (`i` é
  a ordem da lista, usada no desempate).
  """

  alias Abyss.World.Grid
  alias Abyss.World.Map, as: WMap

  @zero {0.0, 0.0, 0.0}

  @doc "O caçador come a presa se ela está na dieta `{:prey, list}` e é estritamente
  menor; `:predator` come qualquer estritamente menor de outra espécie."
  @spec can_eat?(map, number, map, number) :: boolean
  def can_eat?(%{diet: {:prey, list}}, hunter_r, %{id: prey_id}, prey_r),
    do: prey_id in list and prey_r < hunter_r

  def can_eat?(%{diet: :predator, id: hid}, hunter_r, %{id: prey_id}, prey_r),
    do: prey_id != hid and prey_r < hunter_r

  def can_eat?(_hunter_sp, _hunter_r, _prey_sp, _prey_r), do: false

  @doc """
  Sorteio determinístico do escape da presa no bote (`escape` = chance, 0..1),
  pelo trio caçador, presa e relógio do passo.
  """
  @spec escapes?(number, term, term, integer) :: boolean
  def escapes?(escape, hunter_id, prey_id, now_ms),
    do: :erlang.phash2({hunter_id, prey_id, now_ms}, 1_000_000) / 1_000_000 < escape

  @doc "Alcance com que uma presa numa região de `cover` c é percebida: `range × (1 − c)`."
  @spec perceived_range(number, number) :: float
  def perceived_range(range, region_cover), do: range * (1 - region_cover) * 1.0

  @doc "`cover` da região do ponto (a de maior profundidade de borda)."
  @spec cover_at(map, {number, number, number}) :: float
  def cover_at(%{map: map}, {x, _, z}), do: WMap.cover_at(map, x, z)

  @doc """
  Posição do caçador mais próximo, dentro de `perception` (que a cobertura não
  reduz), que poderia comer `o`; `nil` se não há nenhum.
  """
  @spec threat(map, map, number, Grid.t(), map) :: {float, float, float} | nil
  def threat(o, sp, r, grid, bounds) do
    {x, _, z} = o.pos
    range = sp.perception

    grid
    |> Grid.near(x, z, range)
    |> Enum.reduce(nil, fn {i, id, pos, hr, hsp, _vel, _e}, best ->
      d = dist(o.pos, pos)

      if id != o.id and d <= range and closer?(d, i, best) and
           can_eat?(Map.fetch!(bounds.species, hsp), hr, sp, r),
         do: {d, i, pos},
         else: best
    end)
    |> case do
      nil -> nil
      {_, _, pos} -> pos
    end
  end

  @doc """
  Fuga a `max_speed × burst`, para longe da ameaça. Com `shelter` e fora de
  cobertura, a direção mistura 50% rumo ao centro da região com `cover > 0`
  mais próxima. Já dentro da cobertura, só se afasta: puxar para o centro
  levaria a presa de volta ao caçador quando ele está entre ela e o centro.
  """
  @spec flee_steer(map, map, {number, number, number}, map) :: {float, float, float}
  def flee_steer(o, sp, threat_pos, bounds) do
    away = o.pos |> sub(threat_pos) |> unit()
    seek_cover? = sp.shelter and cover_at(bounds, o.pos) == 0

    dir =
      case seek_cover? && nearest_shelter(o.pos, bounds.shelters) do
        {cx, cz} ->
          {x, _, z} = o.pos
          to = unit({cx - x, 0.0, cz - z})
          away |> scale(0.5) |> add(scale(to, 0.5)) |> unit()

        _ ->
          away
      end

    dir = if dir == @zero, do: away, else: dir
    scale(dir, sp.max_speed * sp.burst)
  end

  @doc """
  Cardume: coesão (rumo ao centro dos vizinhos) e alinhamento (velocidade
  média deles) com os da mesma espécie a até `school_range`, com módulo
  `school_weight × max_speed`. Zero sem `school` ou sem vizinhos.
  """
  @spec school_steer(map, map, Grid.t(), map) :: {float, float, float}
  def school_steer(_o, %{school: false}, _grid, _eco), do: @zero

  def school_steer(o, sp, grid, eco) do
    {x, _, z} = o.pos
    range = eco.school_range

    {n, psum, vsum} =
      grid
      |> Grid.near(x, z, range)
      |> Enum.sort()
      |> Enum.reduce({0, @zero, @zero}, fn {_i, id, pos, _r, s, vel, _e}, {n, ps, vs} = acc ->
        if id != o.id and s == o.species and dist(o.pos, pos) <= range,
          do: {n + 1, add(ps, pos), add(vs, vel)},
          else: acc
      end)

    if n == 0 do
      @zero
    else
      cohesion = psum |> scale(1 / n) |> sub(o.pos) |> unit()
      alignment = vsum |> scale(1 / n) |> unit()
      cohesion |> add(alignment) |> unit() |> scale(eco.school_weight * sp.max_speed)
    end
  end

  defp closer?(_d, _i, nil), do: true
  defp closer?(d, i, {bd, bi, _}), do: d < bd or (d == bd and i < bi)

  defp nearest_shelter(_pos, []), do: nil

  defp nearest_shelter({x, _, z}, shelters),
    do: Enum.min_by(shelters, fn {cx, cz} -> (cx - x) * (cx - x) + (cz - z) * (cz - z) end)

  defp norm({x, y, z}), do: :math.sqrt(x * x + y * y + z * z)
  defp dist(a, b), do: norm(sub(a, b))

  defp unit(v) do
    n = norm(v)
    if n > 1.0e-9, do: scale(v, 1 / n), else: @zero
  end

  defp add({a, b, c}, {d, e, f}), do: {a + d, b + e, c + f}
  defp sub({a, b, c}, {d, e, f}), do: {a - d, b - e, c - f}
  defp scale({a, b, c}, k), do: {a * k, b * k, c * k}
end
