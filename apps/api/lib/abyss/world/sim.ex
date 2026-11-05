defmodule Abyss.World.Sim do
  @moduledoc """
  Núcleo puro e determinístico do movimento. Sem processos, sem RNG global,
  sem leitura de Application env: tudo entra por `new/1` e `step/2`.

  Buscas por vizinhança usam grades espaciais de célula 8 (`Abyss.World.Grid`):
  esponjas (fixas, montada em `new/1`), organismos para a separação e
  partículas (remontadas a cada tick). A grade só corta candidatos; a ordem de
  soma e o desempate são os da varredura linear, então o resultado é idêntico.
  """

  alias Abyss.World.{Flora, Grid, Organism, Particles, Species}
  alias Abyss.World.Map, as: WMap

  @edge_margin 3.0
  @y_margin 0.5
  @sep_gap 0.5
  @spawn_tries 50
  @sponge_reach 1.0
  @max_population 400
  # Passo máximo entregue à comida: um tick atrasado não pode virar um lambda
  # gigante no Poisson das partículas (Knuth degrada com lambda grande).
  @max_food_dt 0.5
  @eat_margin 0.6
  @drift_weight 0.15

  @no_events %{changed: [], spawned: [], removed: []}
  @no_totals %{eaten_flora: 0, eaten_particles: 0, particles_expired: 0}

  defstruct organisms: [],
            rng: nil,
            tick: 0,
            bounds: %{},
            flora: nil,
            particles: nil,
            food_cfg: %{},
            now_ms: 0,
            food_events: @no_events,
            totals: @no_totals

  @type food_events :: %{
          changed: [{non_neg_integer, float}],
          spawned: [map],
          removed: [pos_integer]
        }
  @type t :: %__MODULE__{
          organisms: [Organism.t()],
          rng: :rand.state(),
          tick: non_neg_integer,
          bounds: map,
          flora: Flora.t(),
          particles: Particles.t(),
          food_cfg: map,
          now_ms: integer,
          food_events: food_events,
          totals: map
        }

  @doc """
  `opts`: `population` (5..400), `seed`, `now_ms`, `map` (`Abyss.World.Map`),
  `creature_scale` (raio efetivo = body_radius × escala), `test_species`
  (false = mundo sem organismos) e `food` (mapa do bloco `:food`).
  """
  @spec new(map) :: t
  def new(%{
        population: pop,
        seed: seed,
        now_ms: now_ms,
        map: %WMap{} = map,
        creature_scale: scale,
        test_species: test_species,
        food: food
      })
      when is_integer(pop) and pop >= 5 and pop <= @max_population do
    bounds = bounds(map, scale)
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

    {flora, rng} = Flora.new(map, rng, food)

    %__MODULE__{
      organisms: organisms,
      rng: rng,
      tick: 0,
      bounds: bounds,
      flora: flora,
      particles: Particles.new(map, food),
      food_cfg: food,
      now_ms: now_ms
    }
  end

  def new(%{population: pop}) do
    raise ArgumentError,
          "população deve estar entre 5 e #{@max_population}, recebido: #{inspect(pop)}"
  end

  # Fixos do mapa, calculados uma vez: esponjas numa grade de discos (alcance
  # máximo de sponge_steer/keep_out_sponges) e o centro mais rico por dieta.
  defp bounds(map, scale) do
    max_r = Species.all() |> Enum.map(& &1.body_radius) |> Enum.max() |> Kernel.*(scale)

    sponge_grid =
      map.sponges
      |> Enum.with_index(fn sp, i -> {sp.x, sp.z, sp.r + max_r + @sponge_reach, i} end)
      |> Grid.build_discs()

    %{
      map: map,
      creature_scale: scale,
      y_min: map.y_min,
      y_max: map.y_max,
      max_r: max_r,
      sponges: List.to_tuple(map.sponges),
      sponge_grid: sponge_grid,
      richest: %{
        flora: Enum.max_by(map.regions, & &1.flora_patches).center,
        particles: Enum.max_by(map.regions, & &1.particle_share).center
      }
    }
  end

  @doc "Raio efetivo (body_radius × creature_scale) da espécie."
  @spec body_radius(t, atom) :: float
  def body_radius(%__MODULE__{bounds: bounds}, species_id),
    do: eff_radius(Species.get!(species_id), bounds)

  @doc "Avança `dt` s; o relógio da comida anda `dt` (testes e simulações offline)."
  @spec step(t, float) :: t
  def step(%__MODULE__{} = sim, dt), do: step(sim, dt, sim.now_ms + round(dt * 1000))

  @doc "Avança `dt` s com o relógio do mundo em `now_ms` (o Server passa o relógio real)."
  @spec step(t, float, integer) :: t
  def step(%__MODULE__{organisms: orgs, rng: rng, bounds: bounds} = sim, dt, now_ms) do
    fdt = min(dt, @max_food_dt)
    {flora, changed} = Flora.step(sim.flora, fdt)
    {particles, spawned, expired, rng} = Particles.step(sim.particles, fdt, now_ms, rng)

    env = %{
      bounds: bounds,
      cfg: sim.food_cfg,
      now_ms: now_ms,
      particle_index: Particles.index(particles, now_ms)
    }

    food = %{flora: flora, particles: particles, eaten_ids: [], bites: 0, takes: 0}

    # {i, id, pos, r}: i é a ordem da lista, para a separação somar na mesma ordem.
    snapshot =
      orgs
      |> Enum.with_index(fn o, i ->
        {x, _, z} = o.pos
        {x, z, {i, o.id, o.pos, eff_radius(Species.get!(o.species), bounds)}}
      end)
      |> Grid.build()

    {new_orgs, {rng, food}} =
      Enum.map_reduce(orgs, {rng, food}, fn o, {rng, food} ->
        {o, rng, food} = step_one(o, snapshot, env, dt, rng, food)
        {o, {rng, food}}
      end)

    removed = expired ++ Enum.reverse(food.eaten_ids)

    totals = %{
      eaten_flora: sim.totals.eaten_flora + food.bites,
      eaten_particles: sim.totals.eaten_particles + food.takes,
      particles_expired: sim.totals.particles_expired + length(expired)
    }

    %{
      sim
      | organisms: new_orgs,
        rng: rng,
        tick: sim.tick + 1,
        flora: food.flora,
        particles: food.particles,
        now_ms: now_ms,
        food_events: %{changed: changed, spawned: spawned, removed: removed},
        totals: totals
    }
  end

  @doc "Totais de comida para /api/stats."
  @spec food_stats(t) :: map
  def food_stats(%__MODULE__{flora: flora, particles: particles, totals: totals}) do
    patches = Tuple.to_list(flora.patches)

    %{
      flora_patches: length(patches),
      flora_level_sum: patches |> Enum.map(& &1.level) |> Enum.sum() |> Float.round(3),
      particles: Particles.count(particles),
      eaten_flora_total: totals.eaten_flora,
      eaten_particles_total: totals.eaten_particles,
      particles_expired_total: totals.particles_expired
    }
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
      do: {keep_out_sponges(pos, r, bounds), rng},
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

  defp step_one(o, snapshot, %{bounds: bounds} = env, dt, rng, food) do
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

    {o, seek, food} = forage(o, sp, r, dt, env, food)

    desired =
      dir
      |> scale(target)
      |> add(edge_steer(o.pos, bounds, sp.max_speed))
      |> add(sponge_steer(o.pos, r, bounds, sp.max_speed))
      |> add(separation(o, sp, r, snapshot, bounds.max_r))
      |> add(seek)

    k = min(1.0, sp.turn_rate * dt)
    vel = o.vel |> add(scale(sub(desired, o.vel), k)) |> clamp_norm(sp.max_speed)

    pos =
      o.pos
      |> add(scale(vel, dt))
      |> clamp_volume(bounds)
      |> keep_out_sponges(r, bounds)

    {%{o | pos: pos, vel: vel, yaw: yaw, pitch: pitch, mode: mode, mode_left: mode_left}, rng,
     food}
  end

  # --- comida ------------------------------------------------------------------
  # Devolve {organismo, steer, comida}. Comer não tem efeito no E1 além da
  # saciedade (que só silencia a busca).

  @zero {0.0, 0.0, 0.0}

  defp forage(o, %{diet: :none}, _r, _dt, _env, food), do: {o, @zero, food}

  defp forage(o, sp, r, dt, env, food) do
    sated = max(o.sated_left - dt, 0.0)

    if sated > 0 do
      {%{o | sated_left: sated, target: nil}, @zero, food}
    else
      o = %{o | sated_left: 0.0}

      case valid_target(o.target, env, food) || find_target(o, sp, env, food) do
        nil -> {%{o | target: nil}, drift(o, sp, env.bounds), food}
        target -> approach_or_eat(%{o | target: target}, target, sp, r, env, food)
      end
    end
  end

  defp valid_target({:flora, idx} = t, env, food) do
    if elem(food.flora.patches, idx).level >= env.cfg.flora_min_edible, do: t
  end

  defp valid_target({:particle, id} = t, _env, food),
    do: if(Map.has_key?(food.particles.items, id), do: t)

  defp valid_target(nil, _env, _food), do: nil

  defp find_target(o, %{diet: :flora, perception: range}, env, food) do
    {x, _, z} = o.pos

    case Flora.edible_near(food.flora, {x, z}, range, env.cfg.flora_min_edible) do
      nil -> nil
      idx -> {:flora, idx}
    end
  end

  defp find_target(o, %{diet: :particles, perception: range}, env, food) do
    case Particles.near_in(food.particles, env.particle_index, o.pos, range) do
      nil -> nil
      id -> {:particle, id}
    end
  end

  defp approach_or_eat(o, target, sp, r, env, food) do
    tpos = target_pos(target, o.pos, env, food)

    if dist(o.pos, tpos) <= r + @eat_margin do
      {o, food} = eat(o, target, sp, env, food)
      {o, @zero, food}
    else
      {o, tpos |> sub(o.pos) |> unit() |> scale(sp.max_speed), food}
    end
  end

  # A mancha é plana no leito: só o XZ conta (a criatura flutua acima dela).
  defp target_pos({:flora, idx}, {_, y, _}, _env, food) do
    p = elem(food.flora.patches, idx)
    {p.x, y, p.z}
  end

  defp target_pos({:particle, id}, _pos, env, food) do
    {px, py, pz} = Particles.position(Map.fetch!(food.particles.items, id), env.now_ms)
    {px, max(py, env.bounds.y_min), pz}
  end

  defp eat(o, {:flora, idx}, sp, env, food) do
    {flora, _eaten} = Flora.bite(food.flora, idx, env.cfg.flora_bite)

    {%{o | target: nil, sated_left: sp.sated_s * 1.0},
     %{food | flora: flora, bites: food.bites + 1}}
  end

  defp eat(o, {:particle, id}, sp, _env, food) do
    {particles, took?} = Particles.take(food.particles, id)

    food =
      if took?,
        do: %{
          food
          | particles: particles,
            takes: food.takes + 1,
            eaten_ids: [id | food.eaten_ids]
        },
        else: food

    {%{o | target: nil, sated_left: sp.sated_s * 1.0}, food}
  end

  # Faminto e sem nada à vista: deriva rumo ao centro da região mais rica na sua dieta.
  defp drift(o, sp, bounds) do
    {cx, cz} = Map.fetch!(bounds.richest, sp.diet)
    {x, _, z} = o.pos
    {ux, _, uz} = unit({cx - x, 0.0, cz - z})
    {ux * @drift_weight * sp.max_speed, 0.0, uz * @drift_weight * sp.max_speed}
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

  # Borda macia só na fronteira externa da união das regiões: na faixa onde duas
  # regiões se sobrepõem não há borda (senão a faixa estreita Jardim–Floresta vira
  # parede). Longe das sobreposições, é a mesma conta de antes.
  defp edge_steer({x, y, z}, %{map: map, y_min: y0, y_max: y1}, gain) do
    {sx, sz} =
      if WMap.edge_depth(map, x, z) < @edge_margin do
        soft_edge(WMap.outer_edge(map, x, z), gain)
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

  defp soft_edge({depth, {ix, iz}}, gain) do
    if depth < @edge_margin do
      f = (@edge_margin - depth) * gain
      {ix * f, iz * f}
    else
      {0.0, 0.0}
    end
  end

  # Esponjas (cilindros verticais de altura h): afastamento radial no XZ. Só as
  # da célula do ponto podem alcançá-lo; vêm em ordem crescente, como na lista.
  defp sponge_steer({x, y, z}, r, %{sponges: sponges, sponge_grid: grid}, gain) do
    grid
    |> Grid.at(x, z)
    |> Enum.reduce({0.0, 0.0, 0.0}, fn i, acc ->
      sp = elem(sponges, i)
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

  # Projeção dura para fora do cilindro da esponja, esponja a esponja na ordem
  # da lista. Equivale à varredura linear: a partir da posição atual, acha a
  # próxima esponja (índice >= from) que a contém — todas estão na célula da
  # grade —, projeta e segue dali com a nova posição.
  defp keep_out_sponges(pos, r, bounds), do: keep_out_sponges(pos, r, bounds, 0)

  defp keep_out_sponges(
         {px, py, pz} = pos,
         r,
         %{sponges: sponges, sponge_grid: grid} = bounds,
         from
       ) do
    hit =
      grid
      |> Grid.at(px, pz)
      |> Enum.find_value(fn i ->
        sp = elem(sponges, i)

        if i >= from and py < sp.h do
          {ux, uz, d} = away(px, pz, sp)
          if d < sp.r + r, do: {i, sp, ux, uz}
        end
      end)

    case hit do
      nil ->
        pos

      {i, sp, ux, uz} ->
        min_d = sp.r + r
        keep_out_sponges({sp.x + ux * min_d, py, sp.z + uz * min_d}, r, bounds, i + 1)
    end
  end

  # {ux, uz, d}: direção unitária da esponja para o ponto e a distância no XZ.
  defp away(x, z, sp) do
    dx = x - sp.x
    dz = z - sp.z
    d = :math.sqrt(dx * dx + dz * dz)
    if d > 1.0e-9, do: {dx / d, dz / d, d}, else: {1.0, 0.0, d}
  end

  # Vizinhos pela grade (todo r <= max_r), somados na ordem da lista.
  defp separation(o, sp, r0, grid, max_r) do
    {x, _, z} = o.pos

    grid
    |> Grid.near(x, z, r0 + max_r + @sep_gap)
    |> Enum.sort()
    |> Enum.reduce({0.0, 0.0, 0.0}, fn {_i, id, pos, r}, acc ->
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

  defp unit(v) do
    n = norm(v)
    if n > 1.0e-9, do: scale(v, 1 / n), else: {0.0, 0.0, 0.0}
  end

  defp add({a, b, c}, {d, e, f}), do: {a + d, b + e, c + f}
  defp sub({a, b, c}, {d, e, f}), do: {a - d, b - e, c - f}
  defp scale({a, b, c}, k), do: {a * k, b * k, c * k}
end
