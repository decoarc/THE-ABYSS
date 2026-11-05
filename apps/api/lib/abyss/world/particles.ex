defmodule Abyss.World.Particles do
  @moduledoc """
  Partículas de comida canônicas: nascem no alto, caem com velocidade
  constante, repousam no leito e expiram. A posição é função pura do
  instante (`position/2`), então o cliente a calcula sozinho a partir de
  `{p0, v, born_ms, rest_y}`; só nascimento e remoção trafegam.

  A partícula leva `rest_y` para que `position/2` não dependa do mapa.

  A busca da mais próxima usa um índice (`index/2`): as posições de todas as
  partículas num instante, calculadas uma vez e postas numa grade espacial.
  O Sim monta um por tick e o consulta para cada criatura faminta.
  """

  alias Abyss.World.Grid
  alias Abyss.World.Map, as: WMap

  defstruct [:map, :cfg, items: %{}, next_id: 1]

  @type particle :: %{
          id: pos_integer,
          p0: {float, float, float},
          v: {float, float, float},
          born_ms: integer,
          life_ms: integer,
          rest_y: number
        }
  @type t :: %__MODULE__{
          map: WMap.t(),
          cfg: map,
          items: %{pos_integer => particle},
          next_id: pos_integer
        }
  @typedoc "Posições num instante (y já limitado a >= y_min), numa grade XZ."
  @type index :: Grid.t()

  @spawn_height 2.0

  @spec new(WMap.t(), map) :: t
  def new(%WMap{} = map, cfg), do: %__MODULE__{map: map, cfg: cfg}

  @spec count(t) :: non_neg_integer
  def count(%__MODULE__{items: items}), do: map_size(items)

  @doc "Expira, depois faz nascer (Poisson de `rate × dt`, limitado pelo teto)."
  @spec step(t, float, integer, :rand.state()) :: {t, [particle], [pos_integer], :rand.state()}
  def step(%__MODULE__{cfg: cfg, items: items} = p, dt, now_ms, rng) do
    expired = for {id, pt} <- items, now_ms >= pt.born_ms + pt.life_ms, do: id
    items = Map.drop(items, expired)

    {n, rng} = poisson(cfg.particle_rate * dt, rng)
    n = min(n, max(cfg.particle_cap - map_size(items), 0))

    {born, {next_id, rng}} =
      Enum.map_reduce(1..n//1, {p.next_id, rng}, fn _, {id, rng} ->
        {pt, rng} = spawn(p, id, now_ms, rng)
        {pt, {id + 1, rng}}
      end)

    items = Enum.reduce(born, items, &Map.put(&2, &1.id, &1))
    {%{p | items: items, next_id: next_id}, born, Enum.sort(expired), rng}
  end

  @doc """
  Corpo: `n` partículas no ponto `pos`, com velocidade horizontal para fora
  (0,1..0,2 u/s), queda `particle_fall` e vida `particle_life_s`. Ignoram o
  teto, mas contam nele (o nascimento natural espera enquanto estiver acima).
  """
  @spec add_corpse(t, {float, float, float}, non_neg_integer, integer, :rand.state()) ::
          {t, [particle], :rand.state()}
  def add_corpse(%__MODULE__{cfg: cfg, map: map} = p, {x, y, z}, n, now_ms, rng) do
    {fall_lo, fall_hi} = cfg.particle_fall

    {born, {next_id, rng}} =
      Enum.map_reduce(1..n//1, {p.next_id, rng}, fn _, {id, rng} ->
        {a, rng} = :rand.uniform_s(rng)
        {h, rng} = :rand.uniform_s(rng)
        {f, rng} = :rand.uniform_s(rng)
        speed = 0.1 + 0.1 * h

        pt = %{
          id: id,
          p0: {x, y, z},
          v:
            {speed * :math.cos(2 * :math.pi() * a), -(fall_lo + f * (fall_hi - fall_lo)),
             speed * :math.sin(2 * :math.pi() * a)},
          born_ms: now_ms,
          life_ms: round(cfg.particle_life_s * 1000),
          rest_y: map.particle_rest_y
        }

        {pt, {id + 1, rng}}
      end)

    items = Enum.reduce(born, p.items, &Map.put(&2, &1.id, &1))
    {%{p | items: items, next_id: next_id}, born, rng}
  end

  @doc "Posição no instante `now_ms`: queda linear até `rest_y`, depois parada."
  @spec position(particle, integer) :: {float, float, float}
  def position(%{p0: {x0, y0, z0}, v: {vx, vy, vz}, born_ms: born, rest_y: rest_y}, now_ms) do
    t = max(now_ms - born, 0) / 1000
    y = y0 + vy * t

    if y > rest_y do
      {x0 + vx * t, y, z0 + vz * t}
    else
      t_rest = (rest_y - y0) / vy
      {x0 + vx * t_rest, rest_y * 1.0, z0 + vz * t_rest}
    end
  end

  @doc "Remove a partícula (comida); `false` se já não existia."
  @spec take(t, pos_integer) :: {t, boolean}
  def take(%__MODULE__{items: items} = p, id) do
    if Map.has_key?(items, id), do: {%{p | items: Map.delete(items, id)}, true}, else: {p, false}
  end

  @doc "Índice das posições em `now_ms` (vale enquanto o relógio não andar)."
  @spec index(t, integer) :: index
  def index(%__MODULE__{items: items, map: map}, now_ms) do
    items
    |> Enum.map(fn {id, pt} ->
      {px, py, pz} = position(pt, now_ms)
      {px, pz, {id, px, max(py, map.y_min), pz}}
    end)
    |> Grid.build()
  end

  @doc "Id da partícula mais próxima dentro de `range` (y de quem come limitado a >= y_min), ou nil."
  @spec near(t, {number, number, number}, number, integer) :: pos_integer | nil
  def near(%__MODULE__{} = p, pos, range, now_ms), do: near_in(p, index(p, now_ms), pos, range)

  @doc """
  Como `near/4`, consultando um índice pronto. Partículas do índice que já
  saíram de `items` (comidas neste tick) são ignoradas. Empate na distância:
  o menor id.
  """
  @spec near_in(t, index, {number, number, number}, number) :: pos_integer | nil
  def near_in(%__MODULE__{items: items, map: map}, index, {x, y, z}, range) do
    y = max(y, map.y_min)

    index
    |> Grid.near(x, z, range)
    |> Enum.reduce({nil, range}, fn {id, px, py, pz}, {best, best_d} = acc ->
      d = :math.sqrt((px - x) * (px - x) + (py - y) * (py - y) + (pz - z) * (pz - z))

      if d <= best_d and (best == nil or d < best_d or id < best) and Map.has_key?(items, id),
        do: {id, d},
        else: acc
    end)
    |> elem(0)
  end

  # --- nascimento ----------------------------------------------------------------

  defp spawn(%{map: map, cfg: cfg}, id, now_ms, rng) do
    {region, rng} = pick_region(map.regions, rng)
    {cx, cz} = region.center
    {u, rng} = :rand.uniform_s(rng)
    {a, rng} = :rand.uniform_s(rng)
    rho = region.radius * :math.sqrt(u)
    {fall_lo, fall_hi} = cfg.particle_fall
    {f, rng} = :rand.uniform_s(rng)
    {m, rng} = :rand.uniform_s(rng)
    {b, rng} = :rand.uniform_s(rng)
    drift = cfg.particle_drift * m

    pt = %{
      id: id,
      p0:
        {cx + rho * :math.cos(2 * :math.pi() * a), map.y_max + @spawn_height,
         cz + rho * :math.sin(2 * :math.pi() * a)},
      v:
        {drift * :math.cos(2 * :math.pi() * b), -(fall_lo + f * (fall_hi - fall_lo)),
         drift * :math.sin(2 * :math.pi() * b)},
      born_ms: now_ms,
      life_ms: round(cfg.particle_life_s * 1000),
      rest_y: map.particle_rest_y
    }

    {pt, rng}
  end

  defp pick_region(regions, rng) do
    total = regions |> Enum.map(& &1.particle_share) |> Enum.sum()
    {u, rng} = :rand.uniform_s(rng)

    {region, _} =
      Enum.reduce_while(regions, {nil, u * total}, fn r, {_, left} ->
        if left < r.particle_share,
          do: {:halt, {r, 0.0}},
          else: {:cont, {r, left - r.particle_share}}
      end)

    {region, rng}
  end

  # Knuth; lambda pequeno (taxa × dt).
  defp poisson(lambda, rng), do: poisson(:math.exp(-lambda), 1.0, 0, rng)

  defp poisson(limit, prod, k, rng) do
    {u, rng} = :rand.uniform_s(rng)
    prod = prod * u
    if prod <= limit, do: {k, rng}, else: poisson(limit, prod, k + 1, rng)
  end
end
