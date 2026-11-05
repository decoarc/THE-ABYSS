defmodule Abyss.World.Sim do
  @moduledoc """
  Núcleo puro e determinístico do movimento. Sem processos, sem RNG global,
  sem leitura de Application env: tudo entra por `new/1` e `step/2`.

  Buscas por vizinhança usam grades espaciais de célula 8 (`Abyss.World.Grid`):
  esponjas (fixas, montada em `new/1`), organismos para a separação e
  partículas (remontadas a cada tick). A grade só corta candidatos; a ordem de
  soma e o desempate são os da varredura linear, então o resultado é idêntico.
  """

  alias Abyss.World.{Flora, Grid, Life, Organism, Particles, Species}
  alias Abyss.World.Map, as: WMap

  @edge_margin 3.0
  @y_margin 0.5
  @sep_gap 0.5
  @spawn_tries 50
  @sponge_reach 1.0
  @max_population 400
  @divide_speed 0.3
  @zero {0.0, 0.0, 0.0}
  @divide_eps 1.0e-9
  # Passo máximo entregue à comida: um tick atrasado não pode virar um lambda
  # gigante no Poisson das partículas (Knuth degrada com lambda grande).
  @max_food_dt 0.5
  @eat_margin 0.6
  @drift_weight 0.15

  @no_events %{changed: [], spawned: [], removed: []}
  @no_totals %{eaten_flora: 0, eaten_particles: 0, particles_expired: 0}
  @no_life %{deaths: [], births: [], extinct: []}
  @no_eco %{births: %{}, deaths: %{}, hunts_ok: 0, hunts_abandoned: 0, cap_holds: 0}

  defstruct organisms: [],
            rng: nil,
            tick: 0,
            bounds: %{},
            flora: nil,
            particles: nil,
            food_cfg: %{},
            ecology: %{},
            now_ms: 0,
            food_events: @no_events,
            totals: @no_totals,
            life_events: @no_life,
            eco_totals: @no_eco,
            next_seq: %{}

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
          ecology: map,
          now_ms: integer,
          food_events: food_events,
          totals: map,
          life_events: %{deaths: [{String.t(), atom}], births: [Organism.t()], extinct: [tuple]},
          eco_totals: map,
          next_seq: %{atom => pos_integer}
        }

  @doc """
  `opts`: `population` (5..`pop_cap`, e `pop_cap` <= 400), `seed`, `now_ms`, `map` (`Abyss.World.Map`),
  `creature_scale` (raio efetivo = body_radius × escala), `test_species`
  (false = mundo sem organismos), `food` (mapa do bloco `:food`), `species`
  (tabela de espécies, padrão `Species.all/0`) e `ecology` (mapa do bloco
  `:ecology`, padrão o da configuração).
  """
  @spec new(map) :: t
  def new(
        %{
          population: pop,
          seed: seed,
          now_ms: now_ms,
          map: %WMap{} = map,
          creature_scale: scale,
          test_species: test_species,
          food: food
        } = opts
      )
      when is_integer(pop) and pop >= 5 do
    species = Map.get_lazy(opts, :species, &Species.all/0)

    ecology =
      Map.get_lazy(opts, :ecology, fn -> Map.new(Application.fetch_env!(:abyss, :ecology)) end)

    validate_population!(pop, ecology)
    bounds = bounds(map, scale, species)
    rng = :rand.seed_s(:exsss, seed)

    {organisms, rng} =
      if test_species do
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
            {o, rng} = spawn_one(sp, k, now_ms, bounds, ecology, acc, rng)
            {[o | acc], rng}
          end)

        {Enum.reverse(placed), rng}
      else
        {[], rng}
      end

    {flora, rng} = Flora.new(map, rng, food)
    founders = Enum.frequencies_by(organisms, & &1.species)
    next_seq = Map.new(species, &{&1.id, Map.get(founders, &1.id, 0) + 1})

    %__MODULE__{
      next_seq: next_seq,
      organisms: organisms,
      rng: rng,
      tick: 0,
      bounds: bounds,
      flora: flora,
      particles: Particles.new(map, food),
      food_cfg: food,
      ecology: ecology,
      now_ms: now_ms
    }
  end

  def new(%{population: pop}) do
    raise ArgumentError,
          "população deve estar entre 5 e #{@max_population}, recebido: #{inspect(pop)}"
  end

  defp validate_population!(pop, eco) do
    cap = Map.get(eco, :pop_cap, @max_population)

    if cap > @max_population,
      do: raise(ArgumentError, "pop_cap deve ser no máximo #{@max_population}, recebido: #{cap}")

    if pop > cap,
      do: raise(ArgumentError, "população deve estar entre 5 e #{cap} (pop_cap), recebido: #{pop}")
  end

  # Fixos do mapa, calculados uma vez: esponjas numa grade de discos (alcance
  # máximo de sponge_steer/keep_out_sponges) e o centro mais rico por dieta.
  defp bounds(map, scale, species) do
    max_r = species |> Enum.map(& &1.body_radius) |> Enum.max() |> Kernel.*(scale)

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
      species: Map.new(species, &{&1.id, &1}),
      species_list: species,
      sponges: List.to_tuple(map.sponges),
      sponge_grid: sponge_grid,
      richest: %{
        flora: Enum.max_by(map.regions, & &1.flora_patches).center,
        particles: Enum.max_by(map.regions, & &1.particle_share).center
      }
    }
  end

  @doc "Espécies da simulação, na ordem dada."
  @spec species(t) :: [Species.t()]
  def species(%__MODULE__{bounds: %{species_list: list}}), do: list

  defp spec(%{species: by_id}, id), do: Map.fetch!(by_id, id)

  @doc "Raio efetivo (body_radius × creature_scale) da espécie."
  @spec body_radius(t, atom) :: float
  def body_radius(%__MODULE__{bounds: bounds}, species_id),
    do: eff_radius(spec(bounds, species_id), bounds)

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
      eco: sim.ecology,
      cfg: sim.food_cfg,
      now_ms: now_ms,
      particle_index: Particles.index(particles, now_ms)
    }

    food = %{flora: flora, particles: particles, eaten_ids: [], bites: 0, takes: 0, wants: []}

    # {i, id, pos, r}: i é a ordem da lista, para a separação somar na mesma ordem.
    snapshot =
      orgs
      |> Enum.with_index(fn o, i ->
        {x, _, z} = o.pos
        r = Life.radius(o, spec(bounds, o.species), bounds.creature_scale, sim.ecology)
        {x, z, {i, o.id, o.pos, r}}
      end)
      |> Grid.build()

    {new_orgs, {rng, food}} =
      Enum.map_reduce(orgs, {rng, food}, fn o, {rng, food} ->
        {o, rng, food} = step_one(o, snapshot, env, dt, rng, food)
        {o, {rng, food}}
      end)

    # Divisões: concluem (nascidos no fim da lista) antes de remover os mortos,
    # então o filho de um pai que morre neste passo nasce mesmo assim.
    {new_orgs, births, next_seq} = complete_divisions(orgs, new_orgs, sim, now_ms)
    {new_orgs, cap_holds} = start_divisions(new_orgs, births, food.wants, sim)
    new_orgs = new_orgs ++ births

    {survivors, dead} =
      Enum.split_with(new_orgs, &(Life.death_cause(&1, spec(bounds, &1.species), now_ms) == nil))

    {food, corpse_events, rng} = bury(dead, food, sim, now_ms, rng)

    removed = expired ++ Enum.reverse(food.eaten_ids)
    spawned = spawned ++ corpse_events.spawned

    totals = %{
      eaten_flora: sim.totals.eaten_flora + food.bites,
      eaten_particles: sim.totals.eaten_particles + food.takes,
      particles_expired: sim.totals.particles_expired + length(expired)
    }

    %{
      sim
      | organisms: survivors,
        rng: rng,
        tick: sim.tick + 1,
        flora: food.flora,
        particles: food.particles,
        now_ms: now_ms,
        food_events: %{changed: changed, spawned: spawned, removed: removed},
        totals: totals,
        next_seq: next_seq,
        life_events: %{@no_life | deaths: corpse_events.deaths, births: births},
        eco_totals:
          sim.eco_totals
          |> count_deaths(corpse_events.dead_by)
          |> count_births(births)
          |> Map.update!(:cap_holds, &(&1 + cap_holds))
    }
  end

  # Quem tinha `dividing_left > 0` e zerou neste passo termina a divisão: o pai
  # fica com split_parent × energy_max e nasce um jovem ao lado dele.
  defp complete_divisions(old_orgs, new_orgs, sim, now_ms) do
    old_orgs
    |> Enum.zip(new_orgs)
    |> Enum.map_reduce({[], sim.next_seq}, fn {old, o}, {born, seq} ->
      if old.dividing_left > 0 and o.dividing_left == 0 do
        sp = spec(sim.bounds, o.species)
        n = Map.fetch!(seq, o.species)
        child = newborn(o, sp, n, sim, now_ms)
        parent = %{o | energy: sim.ecology.split_parent * sp.energy_max}
        {parent, {[child | born], Map.put(seq, o.species, n + 1)}}
      else
        {o, {born, seq}}
      end
    end)
    |> then(fn {orgs, {born, seq}} -> {orgs, Enum.reverse(born), seq} end)
  end

  defp newborn(parent, sp, n, sim, now_ms) do
    r = Life.radius(parent, sp, sim.bounds.creature_scale, sim.ecology)
    side = parent.yaw + :math.pi() / 2
    {x, y, z} = parent.pos

    %Organism{
      id: "#{sp.code}-#{n |> Integer.to_string() |> String.pad_leading(4, "0")}",
      species: parent.species,
      born_ms: now_ms,
      pos: {x + r * :math.cos(side), y, z + r * :math.sin(side)},
      vel: parent.vel,
      yaw: parent.yaw,
      pitch: parent.pitch,
      mode: parent.mode,
      mode_left: parent.mode_left,
      energy: sim.ecology.split_child * sp.energy_max,
      stage: :juvenile,
      stage_ms: now_ms,
      generation: parent.generation + 1,
      parent_id: parent.id,
      dividing_left: 0.0
    }
  end

  # Quem quer dividir (energia cheia) começa se houver vaga: população mais
  # divisões em curso (e nascidos deste passo) abaixo de pop_cap. Sem vaga, conta
  # um cap_hold e tenta de novo no passo seguinte.
  defp start_divisions(orgs, _births, [], _sim), do: {orgs, 0}

  defp start_divisions(orgs, births, wants, %{ecology: eco, bounds: bounds}) do
    in_course = Enum.count(orgs, &(&1.dividing_left > 0))
    used = length(orgs) + length(births) + in_course

    {started, held, _} =
      wants
      |> Enum.reverse()
      |> Enum.reduce({MapSet.new(), MapSet.new(), used}, fn id, {set, held, n} ->
        if n < eco.pop_cap,
          do: {MapSet.put(set, id), held, n + 1},
          else: {set, MapSet.put(held, id), n}
      end)

    # Quem espera vaga não gasta energia neste passo: continua cheio e tenta de novo.
    {Enum.map(orgs, fn o ->
       cond do
         MapSet.member?(started, o.id) ->
           %{o | dividing_left: eco.divide_s * 1.0}

         MapSet.member?(held, o.id) ->
           %{o | energy: spec(bounds, o.species).energy_max}

         true ->
           o
       end
     end), MapSet.size(held)}
  end

  defp count_births(eco_totals, births) do
    by_sp =
      Enum.reduce(births, eco_totals.births, fn o, acc ->
        Map.update(acc, o.species, 1, &(&1 + 1))
      end)

    %{eco_totals | births: by_sp}
  end

  # Fome e velhice: o corpo vira partículas (round(base + k × raio efetivo)),
  # que entram também em `spawned` para o fio mandá-las.
  defp bury(dead, food, sim, now_ms, rng) do
    {base, per_r} = sim.ecology.corpse_particles

    acc0 = {food, %{deaths: [], spawned: [], dead_by: []}, rng}

    {food, events, rng} =
      Enum.reduce(dead, acc0, fn o, {food, ev, rng} ->
        sp = spec(sim.bounds, o.species)
        cause = Life.death_cause(o, sp, now_ms)
        r = Life.radius(o, sp, sim.bounds.creature_scale, sim.ecology)
        n = round(base + per_r * r)
        {particles, born, rng} = Particles.add_corpse(food.particles, o.pos, n, now_ms, rng)

        {%{food | particles: particles},
         %{
           ev
           | deaths: [{o.id, cause} | ev.deaths],
             spawned: ev.spawned ++ born,
             dead_by: [{o.species, cause} | ev.dead_by]
         }, rng}
      end)

    {food, %{events | deaths: Enum.reverse(events.deaths)}, rng}
  end

  defp count_deaths(eco_totals, dead_by) do
    deaths =
      Enum.reduce(dead_by, eco_totals.deaths, fn {sp, cause}, acc ->
        Map.update(acc, sp, %{cause => 1}, &Map.update(&1, cause, 1, fn n -> n + 1 end))
      end)

    %{eco_totals | deaths: deaths}
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

  defp spawn_one(sp, k, now_ms, bounds, eco, placed, rng) do
    {pos, rng} = pick_position(sp, bounds, placed, rng, @spawn_tries)
    {yaw, rng} = uniform_range(rng, -:math.pi(), :math.pi())
    {mode_left, rng} = initial_mode_left(sp, rng)
    {e_lo, e_hi} = eco.founder_energy
    {frac, rng} = uniform_range(rng, e_lo * 1.0, e_hi * 1.0)
    {age, rng} = uniform_range(rng, 0.0, eco.founder_age * sp.adult_life_s)

    o = %Organism{
      energy: frac * sp.energy_max,
      stage: :adult,
      stage_ms: now_ms - round(age * 1000),
      generation: 1,
      parent_id: nil,
      dividing_left: 0.0,
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
        dist(pos, p.pos) >= r + eff_radius(spec(bounds, p.species), bounds) + @sep_gap
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
    sp = spec(env.bounds, o.species)
    r = Life.radius(o, sp, bounds.creature_scale, env.eco)
    sdt = :math.sqrt(dt)

    {n1, rng} = :rand.normal_s(rng)
    {n2, rng} = :rand.normal_s(rng)
    yaw = o.yaw + n1 * sp.wander * sdt
    pitch = clamp(o.pitch * 0.98 + n2 * 0.3 * sp.wander * sdt, -0.35, 0.35)

    {mode, mode_left, yaw, rng} = advance_mode(sp, o.mode, o.mode_left - dt, yaw, rng)

    dividing? = o.dividing_left > 0

    target =
      cond do
        mode == :pause -> 0.0
        dividing? -> sp.max_speed * @divide_speed
        true -> sp.max_speed
      end

    dir = {:math.cos(pitch) * :math.cos(yaw), :math.sin(pitch), :math.cos(pitch) * :math.sin(yaw)}

    {o, seek, food} =
      if dividing? do
        left = o.dividing_left - dt
        {%{o | dividing_left: if(left <= @divide_eps, do: 0.0, else: left), target: nil}, @zero, food}
      else
        forage(o, sp, r, dt, env, food)
      end

    food =
      if not dividing? and Life.wants_divide?(o, sp), do: %{food | wants: [o.id | food.wants]}, else: food

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

    o = %{o | pos: pos, vel: vel, yaw: yaw, pitch: pitch, mode: mode, mode_left: mode_left}
    o = %{o | energy: Life.drain(o, sp, env.eco, dt)}
    {Life.advance_stage(o, sp, env.now_ms), rng, food}
  end

  # --- comida ------------------------------------------------------------------
  # Devolve {organismo, steer, comida}. Comer não tem efeito no E1 além da
  # saciedade (que só silencia a busca).

  defp forage(o, %{diet: {:prey, _}}, _r, _dt, _env, food), do: {o, @zero, food}

  defp forage(o, sp, r, dt, env, food) do
    sated = max(o.sated_left - dt, 0.0)

    if sated > 0 or o.energy >= sp.energy_max do
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
    {flora, eaten} = Flora.bite(food.flora, idx, env.cfg.flora_bite)
    o = Life.gain(o, sp, eaten * env.eco.flora_energy)

    {%{o | target: nil, sated_left: sp.sated_s * 1.0},
     %{food | flora: flora, bites: food.bites + 1}}
  end

  defp eat(o, {:particle, id}, sp, env, food) do
    {particles, took?} = Particles.take(food.particles, id)
    o = if took?, do: Life.gain(o, sp, env.eco.particle_energy), else: o

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
