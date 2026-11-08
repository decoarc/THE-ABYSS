defmodule Abyss.World.Map do
  @moduledoc """
  Mapa compartilhado do gate E1, lido de `shared/world/map-e1.json` (o mesmo
  arquivo que o cliente importa). Regiões são círculos no plano XZ; a
  profundidade de borda de um ponto é `max_i(raio_i - dist(p, centro_i))` e a
  região do ponto é a que dá esse máximo.
  """

  defstruct [:id, :y_min, :y_max, :particle_rest_y, regions: [], vents: [], sponges: []]

  @type region :: %{
          id: atom,
          center: {number, number},
          radius: number,
          flora_patches: non_neg_integer,
          particle_share: number,
          cover: float
        }
  @type t :: %__MODULE__{
          id: String.t(),
          y_min: number,
          y_max: number,
          particle_rest_y: number,
          regions: [region],
          vents: [{number, number}],
          sponges: [%{x: number, z: number, r: number, h: number}]
        }

  @spec load!(Path.t()) :: t
  def load!(path) do
    raw = path |> File.read!() |> Jason.decode!()

    %__MODULE__{
      id: raw["id"],
      y_min: raw["y_min"],
      y_max: raw["y_max"],
      particle_rest_y: raw["particle_rest_y"],
      regions: Enum.map(raw["regions"], &region/1),
      vents: Enum.map(raw["vents"], fn [x, z] -> {x, z} end),
      sponges: Enum.map(raw["sponges"], fn s -> %{x: s["x"], z: s["z"], r: s["r"], h: s["h"]} end)
    }
  end

  defp region(r) do
    [cx, cz] = r["center"]

    %{
      id: String.to_atom(r["id"]),
      center: {cx, cz},
      radius: r["radius"],
      flora_patches: r["flora_patches"],
      particle_share: r["particle_share"],
      cover: (r["cover"] || 0) * 1.0
    }
  end

  @doc "Profundidade de borda: positiva dentro de alguma região, negativa fora de todas."
  @spec edge_depth(t, number, number) :: float
  def edge_depth(%__MODULE__{} = map, x, z), do: map |> deepest(x, z) |> elem(0)

  @doc "Região onde a profundidade de borda é máxima."
  @spec region_at(t, number, number) :: atom
  def region_at(%__MODULE__{} = map, x, z), do: map |> deepest(x, z) |> elem(1) |> Map.fetch!(:id)

  @doc "`cover` da região onde a profundidade de borda é máxima (0 se a região não tem)."
  @spec cover_at(t, number, number) :: float
  def cover_at(%__MODULE__{} = map, x, z), do: map |> deepest(x, z) |> elem(1) |> Map.get(:cover, 0.0)

  @doc "Vetor unitário rumo ao centro da região mais profunda ({0.0, 0.0} no próprio centro)."
  @spec inward(t, number, number) :: {float, float}
  def inward(%__MODULE__{} = map, x, z) do
    {_depth, %{center: {cx, cz}}} = deepest(map, x, z)
    dx = cx - x
    dz = cz - z
    len = :math.sqrt(dx * dx + dz * dz)
    if len == 0.0, do: {0.0, 0.0}, else: {dx / len, dz / len}
  end

  @doc """
  Borda externa da união das regiões: `{profundidade, {ix, iz}}`, com a
  distância até o ponto mais próximo da fronteira da união e o vetor unitário que
  se afasta dele. Faixas de sobreposição entre regiões não são borda.

  Fora da união, ou quando o ponto mais próximo é o da própria região mais
  profunda, devolve exatamente `{edge_depth/3, inward/3}`.
  """
  @spec outer_edge(t, number, number) :: {float, {float, float}}
  def outer_edge(%__MODULE__{regions: regions} = map, x, z) do
    {depth, own} = deepest(map, x, z)

    if depth < 0 do
      {depth, inward(map, x, z)}
    else
      # A fronteira da união é feita de arcos não cobertos por outra região. O
      # ponto mais próximo dela é a projeção radial num círculo que contém o ponto
      # ou uma das pontas desses arcos (interseções de dois círculos).
      own_edge =
        if covered?(radial(own, x, z), regions, [own]), do: [], else: [{depth, inward(map, x, z)}]

      others =
        for r <- regions,
            r != own,
            inside?(r, x, z),
            q <- [radial(r, x, z)],
            not covered?(q, regions, [r]),
            do: away(x, z, q)

      cusps =
        for {a, i} <- Enum.with_index(regions),
            {b, j} <- Enum.with_index(regions),
            i < j,
            q <- intersections(a, b),
            not covered?(q, regions, [a, b]),
            do: away(x, z, q)

      case own_edge ++ others ++ cusps do
        [] -> {depth, inward(map, x, z)}
        candidates -> Enum.min_by(candidates, &elem(&1, 0))
      end
    end
  end

  defp inside?(%{center: {cx, cz}, radius: r}, x, z),
    do: (x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r

  # Projeção radial de (x, z) no círculo da região (nil no próprio centro).
  defp radial(%{center: {cx, cz}, radius: r}, x, z) do
    dx = x - cx
    dz = z - cz
    len = :math.sqrt(dx * dx + dz * dz)
    if len == 0.0, do: nil, else: {cx + dx / len * r, cz + dz / len * r}
  end

  defp covered?(nil, _regions, _skip), do: true

  defp covered?({qx, qz}, regions, skip) do
    Enum.any?(regions, fn %{center: {cx, cz}, radius: r} = reg ->
      reg not in skip and (qx - cx) * (qx - cx) + (qz - cz) * (qz - cz) < r * r
    end)
  end

  defp away(x, z, {qx, qz}) do
    dx = x - qx
    dz = z - qz
    len = :math.sqrt(dx * dx + dz * dz)
    if len == 0.0, do: {0.0, {0.0, 0.0}}, else: {len, {dx / len, dz / len}}
  end

  defp intersections(%{center: {ax, az}, radius: ra}, %{center: {bx, bz}, radius: rb}) do
    dx = bx - ax
    dz = bz - az
    d = :math.sqrt(dx * dx + dz * dz)

    if d == 0.0 or d >= ra + rb or d <= abs(ra - rb) do
      []
    else
      a = (ra * ra - rb * rb + d * d) / (2 * d)
      h = :math.sqrt(max(ra * ra - a * a, 0.0))
      {mx, mz} = {ax + a * dx / d, az + a * dz / d}
      [{mx - h * dz / d, mz + h * dx / d}, {mx + h * dz / d, mz - h * dx / d}]
    end
  end

  defp deepest(%__MODULE__{regions: regions}, x, z) do
    regions
    |> Enum.map(fn %{center: {cx, cz}, radius: r} = region ->
      {r - :math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)), region}
    end)
    |> Enum.max_by(&elem(&1, 0))
  end
end
