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
          particle_share: number
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
      sponges:
        Enum.map(raw["sponges"], fn s -> %{x: s["x"], z: s["z"], r: s["r"], h: s["h"]} end)
    }
  end

  defp region(r) do
    [cx, cz] = r["center"]

    %{
      id: String.to_atom(r["id"]),
      center: {cx, cz},
      radius: r["radius"],
      flora_patches: r["flora_patches"],
      particle_share: r["particle_share"]
    }
  end

  @doc "Profundidade de borda: positiva dentro de alguma região, negativa fora de todas."
  @spec edge_depth(t, number, number) :: float
  def edge_depth(%__MODULE__{} = map, x, z), do: map |> deepest(x, z) |> elem(0)

  @doc "Região onde a profundidade de borda é máxima."
  @spec region_at(t, number, number) :: atom
  def region_at(%__MODULE__{} = map, x, z), do: map |> deepest(x, z) |> elem(1) |> Map.fetch!(:id)

  @doc "Vetor unitário rumo ao centro da região mais profunda ({0.0, 0.0} no próprio centro)."
  @spec inward(t, number, number) :: {float, float}
  def inward(%__MODULE__{} = map, x, z) do
    {_depth, %{center: {cx, cz}}} = deepest(map, x, z)
    dx = cx - x
    dz = cz - z
    len = :math.sqrt(dx * dx + dz * dz)
    if len == 0.0, do: {0.0, 0.0}, else: {dx / len, dz / len}
  end

  defp deepest(%__MODULE__{regions: regions}, x, z) do
    regions
    |> Enum.map(fn %{center: {cx, cz}, radius: r} = region ->
      {r - :math.sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz)), region}
    end)
    |> Enum.max_by(&elem(&1, 0))
  end
end
