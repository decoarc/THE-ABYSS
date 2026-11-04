defmodule Abyss.World.Flora do
  @moduledoc """
  Flora canônica: manchas fixas no leito, cada uma com um nível de 0 a 1 que
  cresce sozinho (mais rápido perto das fontes) e cai quando mordido. Dados
  puros, RNG explícito; quem chama é dono do tempo.

  Cada mancha guarda `q`, o degrau inteiro (passo de 0,02) do último nível
  reportado, para que `step/2` só liste o que mudou de fato.
  """

  alias Abyss.World.Map, as: WMap

  @quant 0.02
  @sponge_margin 0.5
  @tries 100

  defstruct patches: {}, cfg: %{}

  @type patch :: %{x: float, z: float, level: float, rate: float, q: non_neg_integer}
  @type t :: %__MODULE__{patches: tuple, cfg: map}

  @doc "`cfg`: mapa com `flora_grow_s` e `vent_boost` (bloco `:food`)."
  @spec new(WMap.t(), :rand.state(), map) :: {t, :rand.state()}
  def new(%WMap{} = map, rng, cfg) do
    {groups, rng} =
      Enum.map_reduce(map.regions, rng, fn region, rng ->
        Enum.map_reduce(1..region.flora_patches//1, rng, fn _, rng ->
          place(map, region, cfg, rng)
        end)
      end)

    {%__MODULE__{patches: groups |> List.flatten() |> List.to_tuple(), cfg: cfg}, rng}
  end

  @doc "Cresce todas as manchas por `dt` s; devolve `[{idx, level_q}]` das que mudaram de degrau."
  @spec step(t, float) :: {t, [{non_neg_integer, float}]}
  def step(%__MODULE__{patches: patches} = flora, dt) do
    {list, changed} =
      patches
      |> Tuple.to_list()
      |> Enum.with_index()
      |> Enum.map_reduce([], fn {p, idx}, acc ->
        p = %{p | level: min(1.0, p.level + p.rate * dt)}
        q = quantum(p.level)

        if q == p.q,
          do: {p, acc},
          else: {%{p | q: q}, [{idx, level_q(q)} | acc]}
      end)

    {%{flora | patches: List.to_tuple(list)}, Enum.reverse(changed)}
  end

  @doc "Tira até `amount` do nível da mancha; devolve quanto foi de fato comido."
  @spec bite(t, non_neg_integer, float) :: {t, float}
  def bite(%__MODULE__{patches: patches} = flora, idx, amount) do
    p = elem(patches, idx)
    eaten = min(p.level, amount)
    level = max(p.level - eaten, 0.0)
    {%{flora | patches: put_elem(patches, idx, %{p | level: level})}, eaten}
  end

  @doc "Índice da mancha mais próxima (XZ) dentro de `range` com nível >= `min_level`, ou nil."
  @spec edible_near(t, {number, number}, number, number) :: non_neg_integer | nil
  def edible_near(%__MODULE__{patches: patches}, {x, z}, range, min_level) do
    patches
    |> Tuple.to_list()
    |> Enum.with_index()
    |> Enum.reduce({nil, range}, fn {p, idx}, {best, best_d} = acc ->
      d = :math.sqrt((p.x - x) * (p.x - x) + (p.z - z) * (p.z - z))
      if p.level >= min_level and d <= best_d and (best == nil or d < best_d), do: {idx, d}, else: acc
    end)
    |> elem(0)
  end

  # --- colocação -----------------------------------------------------------------

  defp place(map, region, cfg, rng), do: place(map, region, cfg, rng, @tries)

  defp place(map, region, cfg, rng, tries) do
    {cx, cz} = region.center
    {u, rng} = :rand.uniform_s(rng)
    {a, rng} = :rand.uniform_s(rng)
    rho = region.radius * :math.sqrt(u)
    x = cx + rho * :math.cos(2 * :math.pi() * a)
    z = cz + rho * :math.sin(2 * :math.pi() * a)

    if valid?(map, region, x, z) or tries <= 1 do
      {level, rng} = :rand.uniform_s(rng)
      level = 0.3 + level * 0.7
      {%{x: x, z: z, level: level, rate: rate(map, cfg, x, z), q: quantum(level)}, rng}
    else
      place(map, region, cfg, rng, tries - 1)
    end
  end

  # Dentro do mapa, na própria região (onde regiões se sobrepõem) e fora das esponjas.
  defp valid?(map, region, x, z) do
    WMap.edge_depth(map, x, z) > 0 and WMap.region_at(map, x, z) == region.id and
      Enum.all?(map.sponges, fn s ->
        :math.sqrt((x - s.x) * (x - s.x) + (z - s.z) * (z - s.z)) > s.r + @sponge_margin
      end)
  end

  defp rate(map, cfg, x, z) do
    d2 =
      map.vents
      |> Enum.map(fn {vx, vz} -> (x - vx) * (x - vx) + (z - vz) * (z - vz) end)
      |> Enum.min()

    1 / cfg.flora_grow_s * (1 + cfg.vent_boost * :math.exp(-d2 / 128))
  end

  defp quantum(level), do: round(level / @quant)
  defp level_q(q), do: Float.round(q * @quant, 2)
end
