defmodule Abyss.World.Sim do
  @moduledoc """
  Núcleo puro e determinístico do movimento. Sem processos, sem RNG global,
  sem leitura de Application env: tudo entra por `new/1` e `step/2`.
  """

  alias Abyss.World.{Organism, Species}
  alias Abyss.World.Map, as: WMap

  @edge_margin 3.0
  @y_margin 0.5
  @sep_gap 0.5
  @spawn_tries 50
  @sponge_reach 1.0
  @max_population 400

  defstruct organisms: [], rng: nil, tick: 0, bounds: %{}

  @type t :: %__MODULE__{
          organisms: [Organism.t()],
          rng: :rand.state(),
          tick: non_neg_integer,
          bounds: map
        }

  @doc """
  `opts`: `population` (5..400), `seed`, `now_ms`, `map` (`Abyss.World.Map`),
  `creature_scale` (raio efetivo = body_radius × escala) e `test_species`
  (false = mundo sem organismos).
  """
  @spec new(map) :: t
  def new(%{
        population: pop,
        seed: seed,
        now_ms: now_ms,
        map: %WMap{} = map,
        creature_scale: scale,
        test_species: test_species
      })
      when is_integer(pop) and pop >= 5 and pop <= @max_population do
    bounds = %{map: map, creature_scale: scale, y_min: map.y_min, y_max: map.y_max}
    rng = :rand.seed_s(:exsss, seed)

    {organisms, rng} =
      if test_species do
        species = Species.all()
        n = length(species)
        base = div(pop, n)
        extra = rem(pop, n)

        roster =
          species
          |> Enum.with_index()
          |> Enum.flat_map(fn {sp, i} ->
            for k <- 1..(base + if(i < extra, do: 1, else: 0)), do: {sp, k}
          end)

        {placed, rng} =
          Enum.reduce(roster, {[], rng}, fn {sp, k}, {acc, rng} ->
            {o, rng} = spawn_one(sp, k, now_ms, bounds, acc, rng)
            {[o | acc], rng}
          end)

        {Enum.reverse(placed), rng}
      else
        {[], rng}
      end

    %__MODULE__{organisms: organisms, rng: rng, tick: 0, bounds: bounds}
  end

  def new(%{population: pop}) do
    raise ArgumentError,
          "população deve estar entre 5 e #{@max_population}, recebido: #{inspect(pop)}"
  end

  @doc "Raio efetivo (body_radius × creature_scale) da espécie."
  @spec body_radius(t, atom) :: float
  def body_radius(%__MODULE__{bounds: bounds}, species_id),
    do: eff_radius(Species.get!(species_id), bounds)

  @spec step(t, float) :: t
  def step(%__MODULE__{organisms: orgs, rng: rng, bounds: bounds} = sim, dt) do
    snapshot = Enum.map(orgs, &{&1.id, &1.pos, eff_radius(Species.get!(&1.species), bounds)})

    {new_orgs, rng} =
      Enum.map_reduce(orgs, rng, fn o, rng -> step_one(o, snapshot, bounds, dt, rng) end)

    %{sim | organisms: new_orgs, rng: rng, tick: sim.tick + 1}
  end

  # --- spawn -----------------------------------------------------------------

  defp spawn_one(sp, k, now_ms, bounds, placed, rng) do
    {pos, rng} = pick_position(sp, bounds, placed, rng, @spawn_tries)
    {yaw, rng} = uniform_range(rng, -:math.pi(), :math.pi())
    {mode_left, rng} = initial_mode_left(sp, rng)

    o = %Organism{
      id: "#{sp.code}-#{k |> Integer.to_string() |> String.pad_leading(4, "0")}",
      species: sp.id,
      born_ms: now_ms,
      pos: pos,
      yaw: yaw,
      mode: :run,
      mode_left: mode_left
    }

    {o, rng}
  end

  defp pick_position(sp, bounds, placed, rng, tries) do
    {pos, rng} = random_position(sp, bounds, rng)
    r = eff_radius(sp, bounds)

    free? =
      Enum.all?(placed, fn p ->
        dist(pos, p.pos) >= r + eff_radius(Species.get!(p.species), bounds) + @sep_gap
      end) and not in_sponge?(pos, r, bounds.map)

    if free? or tries <= 1,
      do: {keep_out_sponges(pos, r, bounds.map), rng},
      else: pick_position(sp, bounds, placed, rng, tries - 1)
  end

  # Região pela dieta; depois um ponto uniforme no disco da região, a pelo
  # menos @edge_margin da borda.
  defp random_position(sp, %{map: map, y_min: y0, y_max: y1}, rng) do
    {region, rng} = pick_region(sp.diet, map.regions, rng)
    {cx, cz} = region.center
    {u, rng} = :rand.uniform_s(rng)
    {a, rng} = uniform_range(rng, 0.0, 2 * :math.pi())
    {y, rng} = uniform_range(rng, y0 + @y_margin, y1 - @y_margin)
    rho = max(region.radius - @edge_margin, 0.0) * :math.sqrt(u)
    {{cx + rho * :math.cos(a), y, cz + rho * :math.sin(a)}, rng}
  end

  defp pick_region(diet, regions, rng) do
    weights =
      Enum.map(regions, fn r ->
        case diet do
          :flora -> r.flora_patches * 1.0
          :particles -> r.particle_share * 1.0
          _ -> 1.0
        end
      end)

    {u, rng} = :rand.uniform_s(rng)
    target = u * Enum.sum(weights)

    {region, _} =
      regions
      |> Enum.zip(weights)
      |> Enum.reduce_while({nil, target}, fn {r, w}, {_, left} ->
        if left < w, do: {:halt, {r, 0.0}}, else: {:cont, {r, left - w}}
      end)

    {region || List.last(regions), rng}
  end

  defp initial_mode_left(%{run_s: {lo, hi}}, rng), do: uniform_range(rng, lo * 1.0, hi * 1.0)
  defp initial_mode_left(_, rng), do: {0.0, rng}

  # --- step ------------------------------------------------------------------

  defp step_one(o, snapshot, bounds, dt, rng) do
    sp = Species.get!(o.species)
    r = eff_radius(sp, bounds)
    sdt = :math.sqrt(dt)

    {n1, rng} = :rand.normal_s(rng)
    {n2, rng} = :rand.normal_s(rng)
    yaw = o.yaw + n1 * sp.wander * sdt
    pitch = clamp(o.pitch * 0.98 + n2 * 0.3 * sp.wander * sdt, -0.35, 0.35)

    {mode, mode_left, yaw, rng} = advance_mode(sp, o.mode, o.mode_left - dt, yaw, rng)

    target = if mode == :pause, do: 0.0, else: sp.max_speed
    dir = {:math.cos(pitch) * :math.cos(yaw), :math.sin(pitch), :math.cos(pitch) * :math.sin(yaw)}

    desired =
      dir
      |> scale(target)
      |> add(edge_steer(o.pos, bounds, sp.max_speed))
      |> add(sponge_steer(o.pos, r, bounds.map, sp.max_speed))
      |> add(separation(o, sp, r, snapshot))

    k = min(1.0, sp.turn_rate * dt)
    vel = o.vel |> add(scale(sub(desired, o.vel), k)) |> clamp_norm(sp.max_speed)

    pos =
      o.pos
      |> add(scale(vel, dt))
      |> clamp_volume(bounds)
      |> keep_out_sponges(r, bounds.map)

    {%{o | pos: pos, vel: vel, yaw: yaw, pitch: pitch, mode: mode, mode_left: mode_left}, rng}
  end

  # Só a Célula alterna entre correr e pausar (run_s/pause_s definidos).
  defp advance_mode(%{run_s: nil}, mode, _left, yaw, rng), do: {mode, 0.0, yaw, rng}

  defp advance_mode(%{pause_s: pause}, :run, left, yaw, rng) when left <= 0 do
    {:pause, pause * 1.0, yaw + :math.pi(), rng}
  end

  defp advance_mode(%{run_s: {lo, hi}}, :pause, left, yaw, rng) when left <= 0 do
    {t, rng} = uniform_range(rng, lo * 1.0, hi * 1.0)
    {:run, t, yaw, rng}
  end

  defp advance_mode(_sp, mode, left, yaw, rng), do: {mode, left, yaw, rng}

  defp edge_steer({x, y, z}, %{map: map, y_min: y0, y_max: y1}, gain) do
    depth = WMap.edge_depth(map, x, z)

    {sx, sz} =
      if depth < @edge_margin do
        {ix, iz} = WMap.inward(map, x, z)
        f = (@edge_margin - depth) * gain
        {ix * f, iz * f}
      else
        {0.0, 0.0}
      end

    lo = y0 + @y_margin
    hi = y1 - @y_margin

    sy =
      cond do
        y < lo -> (lo - y) * gain
        y > hi -> -(y - hi) * gain
        true -> 0.0
      end

    {sx, sy, sz}
  end

  # Esponjas (cilindros verticais de altura h): afastamento radial no XZ.
  defp sponge_steer({x, y, z}, r, map, gain) do
    Enum.reduce(map.sponges, {0.0, 0.0, 0.0}, fn sp, acc ->
      limit = sp.r + r + @sponge_reach
      {ux, uz, d} = away(x, z, sp)

      if d < limit and y < sp.h + 0.5,
        do: add(acc, {ux * (limit - d) * gain, 0.0, uz * (limit - d) * gain}),
        else: acc
    end)
  end

  defp in_sponge?({x, y, z}, r, map) do
    Enum.any?(map.sponges, fn sp ->
      {_, _, d} = away(x, z, sp)
      y < sp.h and d < sp.r + r
    end)
  end

  # Projeção dura para fora do cilindro da esponja.
  defp keep_out_sponges(pos, r, map) do
    Enum.reduce(map.sponges, pos, fn sp, {px, py, pz} = acc ->
      {ux, uz, d} = away(px, pz, sp)
      min_d = sp.r + r

      if py < sp.h and d < min_d,
        do: {sp.x + ux * min_d, py, sp.z + uz * min_d},
        else: acc
    end)
  end

  # {ux, uz, d}: direção unitária da esponja para o ponto e a distância no XZ.
  defp away(x, z, sp) do
    dx = x - sp.x
    dz = z - sp.z
    d = :math.sqrt(dx * dx + dz * dz)
    if d > 1.0e-9, do: {dx / d, dz / d, d}, else: {1.0, 0.0, d}
  end

  defp separation(o, sp, r0, snapshot) do
    Enum.reduce(snapshot, {0.0, 0.0, 0.0}, fn {id, pos, r}, acc ->
      if id == o.id do
        acc
      else
        d = dist(o.pos, pos)
        reach = r0 + r + @sep_gap

        if d < reach do
          {dx, dy, dz} = sub(o.pos, pos)
          u = if d > 1.0e-9, do: {dx / d, dy / d, dz / d}, else: {1.0, 0.0, 0.0}
          add(acc, scale(u, (reach - d) / reach * sp.max_speed * 2.0))
        else
          acc
        end
      end
    end)
  end

  # Clamp duro: y no intervalo do mapa; XZ de volta a edge_depth >= -0.5.
  defp clamp_volume({x, y, z}, %{map: map, y_min: y0, y_max: y1}) do
    depth = WMap.edge_depth(map, x, z)

    {x, z} =
      if depth < -0.5 do
        {ix, iz} = WMap.inward(map, x, z)
        back = -0.5 - depth
        {x + ix * back, z + iz * back}
      else
        {x, z}
      end

    {x, clamp(y, y0, y1), z}
  end

  # --- helpers ---------------------------------------------------------------

  defp eff_radius(sp, %{creature_scale: scale}), do: sp.body_radius * scale

  defp uniform_range(rng, lo, hi) do
    {u, rng} = :rand.uniform_s(rng)
    {lo + u * (hi - lo), rng}
  end

  defp clamp(v, lo, hi), do: v |> max(lo) |> min(hi)

  defp clamp_norm(v, max) do
    n = norm(v)
    if n > max, do: scale(v, max / n), else: v
  end

  defp norm({x, y, z}), do: :math.sqrt(x * x + y * y + z * z)
  defp dist(a, b), do: norm(sub(a, b))
  defp add({a, b, c}, {d, e, f}), do: {a + d, b + e, c + f}
  defp sub({a, b, c}, {d, e, f}), do: {a - d, b - e, c - f}
  defp scale({a, b, c}, k), do: {a * k, b * k, c * k}
end
