defmodule Abyss.World.Sim do
  @moduledoc """
  Núcleo puro e determinístico do movimento. Sem processos, sem RNG global,
  sem leitura de Application env: tudo entra por `new/1` e `step/2`.

  Buscas por vizinhança usam grades espaciais de célula 8 (`Abyss.World.Grid`):
  esponjas (fixas, montada em `new/1`), organismos para a separação e
  partículas (remontadas a cada tick). A grade só corta candidatos; a ordem de
  soma e o desempate são os da varredura linear, então o resultado é idêntico.
  """

  alias Abyss.Genesis.{Mutation, Traits}
  alias Abyss.World.{Branching, Flora, Grid, Hunt, Life, Organism, Particles, Species}
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
  # Padrão da deriva rumo à região rica, se o bloco :ecology não trouxer drift_weight.
  @drift_weight 0.15
  @max_body_radius 1.6
  @founder_spread 1.5
  @max_extinct_created 100

  @no_events %{changed: [], spawned: [], removed: []}
  @no_totals %{eaten_flora: 0, eaten_particles: 0, particles_expired: 0}
  @no_life %{
    deaths: [],
    births: [],
    extinct: [],
    species: [],
    genomes: [],
    branches: [],
    rebranch: [],
    dead_by: [],
    extinct_causes: %{}
  }
  @no_eco %{
    births: %{},
    deaths: %{},
    hunts_ok: 0,
    hunts_abandoned: 0,
    hunts_escaped: 0,
    cap_holds: 0,
    branches: 0
  }

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
            extinct: %{},
            next_seq: %{},
            # Espécies povoadas sem passar por `next_seq` (ramos): contam para a extinção.
            populated: MapSet.new(),
            # Último k de ramo por mãe ("<mãe>.<k>"); só cresce, a poda não o limpa.
            branch_seq: %{},
            pending_species: [],
            pending_founders: [],
            catalog: nil,
            genomes: %{},
            genome_index: %{},
            next_genome: 1,
            pending_genomes: [],
            next_scan_ms: 0

  @type genome :: %{bp: map, traits: Species.t()}
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
          life_events: %{
            deaths: [{String.t(), atom}],
            births: [Organism.t()],
            extinct: [tuple],
            species: [Species.t()],
            genomes: [{pos_integer, map}],
            branches: [Species.t()],
            rebranch: [{String.t(), String.t()}],
            dead_by: [
              {atom | String.t(), :starvation | :old_age | :predation, atom | String.t() | nil}
            ],
            extinct_causes: %{(atom | String.t()) => {atom, atom | String.t() | nil}}
          },
          eco_totals: map,
          extinct: %{atom => integer},
          next_seq: %{atom => pos_integer},
          populated: MapSet.t(),
          branch_seq: %{String.t() => pos_integer},
          pending_species: [Species.t()],
          pending_founders: [Organism.t()],
          catalog: map | nil,
          genomes: %{pos_integer => genome},
          genome_index: %{map => pos_integer},
          next_genome: pos_integer,
          pending_genomes: [pos_integer],
          next_scan_ms: integer
        }

  @doc """
  `opts`: `population` (5..`pop_cap`, e `pop_cap` <= 400), `seed`, `now_ms`, `map` (`Abyss.World.Map`),
  `creature_scale` (raio efetivo = body_radius × escala), `test_species`
  (false = mundo sem organismos), `food` (mapa do bloco `:food`), `species`
  (tabela de espécies, padrão `Species.all/0`) e `ecology` (mapa do bloco
  `:ecology`, padrão o da configuração) e `max_body_radius` (maior raio de corpo que
  uma espécie registrada depois pode ter; padrão 1.6, o do catálogo da gênese),
  `catalog` (catálogo da gênese; padrão nil = sem genomas nem mutação) e
  `mutation_boost` (só para medição: multiplica `part_p` do catálogo, teto 1;
  padrão 1).
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
    bounds = bounds(map, scale, species, Map.get(opts, :max_body_radius, @max_body_radius))
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
      now_ms: now_ms,
      catalog: opts |> Map.get(:catalog) |> boost_mutation(Map.get(opts, :mutation_boost, 1)),
      next_scan_ms: now_ms + scan_ms(ecology)
    }
    |> assign_genomes()
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
      do:
        raise(ArgumentError, "população deve estar entre 5 e #{cap} (pop_cap), recebido: #{pop}")
  end

  # Fixos do mapa, calculados uma vez: esponjas numa grade de discos (alcance
  # máximo de sponge_steer/keep_out_sponges) e o centro mais rico por dieta.
  defp bounds(map, scale, species, max_body_radius) do
    max_r =
      species
      |> Enum.map(& &1.body_radius)
      |> Enum.max()
      |> max(max_body_radius)
      |> Kernel.*(scale)

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
      # Centros das regiões com cobertura (abrigo da fuga) e espécies que alguém caça.
      shelters: for(%{cover: c, center: center} <- map.regions, c > 0, do: center),
      hunted: hunted(species),
      richest: %{
        flora: Enum.max_by(map.regions, & &1.flora_patches).center,
        particles: Enum.max_by(map.regions, & &1.particle_share).center
      }
    }
  end

  # Quem alguma espécie caça: `:all` se existe um `:predator` (caça qualquer
  # menor), senão o conjunto dos ids das dietas `{:prey, ids}`.
  defp hunted(species) do
    if Enum.any?(species, &(&1.diet == :predator)),
      do: :all,
      else: for(%{diet: {:prey, ids}} <- species, id <- ids, into: MapSet.new(), do: id)
  end

  @doc """
  Comida multiplicada por `k` (só para medição, `ABYSS_FOOD_BOOST`): a flora
  cresce `k` vezes mais rápido (`flora_grow_s ÷ k`) e as partículas nascem `k`
  vezes mais (`particle_rate` e `particle_cap` × `k`). Com `k` = 1, o mapa volta
  igual.
  """
  @spec boost_food(map, number) :: map
  def boost_food(food, k) when k == 1, do: food

  def boost_food(food, k) when k > 0 do
    %{
      food
      | flora_grow_s: food.flora_grow_s / k,
        particle_rate: food.particle_rate * k,
        particle_cap: round(food.particle_cap * k)
    }
  end

  @doc "Catálogo com `part_p` × `k`, no máximo 1 (só para medição, `ABYSS_MUTATION_BOOST`)."
  @spec boost_mutation(map | nil, number) :: map | nil
  def boost_mutation(nil, _k), do: nil
  def boost_mutation(cat, k) when k == 1, do: cat

  def boost_mutation(cat, k) when k > 0,
    do: put_in(cat, [:mutation, :part_p], min(cat.mutation.part_p * k, 1.0))

  defp scan_ms(ecology), do: round(Map.get(ecology, :branch_scan_s, 10) * 1000)

  # Organismos iniciais de espécie com planta (com catálogo) recebem o genoma dela.
  defp assign_genomes(%{catalog: nil} = sim), do: sim

  defp assign_genomes(sim) do
    {orgs, sim} =
      Enum.map_reduce(sim.organisms, sim, fn o, sim ->
        sp = spec(sim.bounds, o.species)

        case Map.get(sp, :blueprint) do
          nil ->
            {o, sim}

          bp ->
            {gid, sim} = ensure_genome(sim, bp, fn -> sp end)
            {%{o | genome: gid}, sim}
        end
      end)

    %{sim | organisms: orgs}
  end

  # Acha o genoma da planta ou cria um (características de `traits_fun`); o novo
  # entra em `pending_genomes`, anunciado em `life_events.genomes` do passo.
  # Genoma `:predator` (a boca pode mutar) liga `hunted: :all` para todos
  # passarem a procurar ameaça; só cresce, como atalho conservador.
  defp ensure_genome(sim, bp, traits_fun) do
    case sim.genome_index do
      %{^bp => gid} ->
        {gid, sim}

      _ ->
        gid = sim.next_genome
        traits = traits_fun.()

        bounds =
          if traits.diet == :predator,
            do: %{sim.bounds | hunted: :all},
            else: sim.bounds

        {gid,
         %{
           sim
           | bounds: bounds,
             genomes: Map.put(sim.genomes, gid, %{bp: bp, traits: traits}),
             genome_index: Map.put(sim.genome_index, bp, gid),
             next_genome: gid + 1,
             pending_genomes: [gid | sim.pending_genomes]
         }}
    end
  end

  @doc "Planta do genoma `gid`; nil se ele não existe (ou já foi coletado)."
  @spec genome(t, pos_integer) :: map | nil
  def genome(%__MODULE__{genomes: genomes}, gid) do
    case genomes do
      %{^gid => %{bp: bp}} -> bp
      _ -> nil
    end
  end

  @doc """
  Características do organismo: as do seu genoma ou, sem genoma, as da espécie;
  sempre com `id`, `code` e `name` da espécie do organismo (um genoma pode ser
  compartilhado por espécies de planta igual, ou servir a um ramo). Aceita o `Sim` ou o ambiente do passo (qualquer
  mapa com `bounds` e `genomes`).
  """
  @spec traits_of(t | map, Organism.t()) :: Species.t()
  def traits_of(%{bounds: %{species: by_id}}, %{genome: nil, species: id}),
    do: Map.fetch!(by_id, id)

  def traits_of(%{genomes: genomes, bounds: %{species: by_id}}, %{genome: gid, species: id}) do
    case Map.fetch!(genomes, gid).traits do
      %{id: ^id} = t ->
        t

      t ->
        sp = Map.fetch!(by_id, id)
        %{t | id: id, code: sp.code, name: sp.name}
    end
  end

  # Genomas sem nenhum organismo vivo saem de `genomes` e `genome_index`.
  defp collect_genomes(%{genomes: genomes} = sim) when map_size(genomes) == 0, do: sim

  defp collect_genomes(sim) do
    live =
      for o <- sim.organisms ++ sim.pending_founders,
          o.genome != nil,
          into: MapSet.new(),
          do: o.genome

    %{
      sim
      | genomes: Map.filter(sim.genomes, fn {gid, _} -> MapSet.member?(live, gid) end),
        genome_index: Map.filter(sim.genome_index, fn {_, gid} -> MapSet.member?(live, gid) end)
    }
  end

  # Varredura periódica (a cada branch_scan_s do relógio do mundo); os ramos
  # (`Branching.scan`) rodam no mesmo vencimento, dentro do `step`.
  defp scan(sim, now_ms) do
    if now_ms >= sim.next_scan_ms,
      do: %{collect_genomes(sim) | next_scan_ms: now_ms + scan_ms(sim.ecology)},
      else: sim
  end

  @doc """
  Registra uma espécie em tempo de execução (id já existente: no-op). `opts`:
  `founders` (padrão 3) adultas juntas num ponto de uma região sorteada com
  peso 1 (sem relação com a dieta), entregues no próximo `step` sem contar o
  teto; `extinct_ms` registra a espécie já extinta, sem organismos.
  """
  @spec add_species(t, Species.t(), keyword) :: t
  def add_species(%__MODULE__{bounds: bounds} = sim, sp, opts \\ []) do
    if Map.has_key?(bounds.species, sp.id) do
      sim
    else
      list = bounds.species_list ++ [sp]
      extinct_ms = Keyword.get(opts, :extinct_ms)
      n = if extinct_ms, do: 0, else: Keyword.get(opts, :founders, 3)

      bounds = %{
        bounds
        | species: Map.put(bounds.species, sp.id, sp),
          species_list: list,
          # `:all` só cresce: um genoma predador (boca mutada) pode tê-lo ligado.
          hunted: if(bounds.hunted == :all, do: :all, else: hunted(list))
      }

      sim = %{
        sim
        | bounds: bounds,
          next_seq: Map.put(sim.next_seq, sp.id, n + 1),
          branch_seq: bump_branch_seq(sim.branch_seq, sp),
          pending_species: sim.pending_species ++ [sp],
          extinct: if(extinct_ms, do: Map.put(sim.extinct, sp.id, extinct_ms), else: sim.extinct)
      }

      sim |> add_founders(sp, n) |> prune_extinct()
    end
  end

  # Ramo registrado (pela varredura ou de novo no boot) avança o contador da mãe.
  defp bump_branch_seq(seq, %{id: id, parent: parent}) when is_binary(id) and is_binary(parent) do
    with "." <> k <- String.replace_prefix(id, parent, ""),
         {k, ""} when k > 0 <- Integer.parse(k) do
      Map.update(seq, parent, k, &max(&1, k))
    else
      _ -> seq
    end
  end

  defp bump_branch_seq(seq, _sp), do: seq

  @doc """
  Reserva números de ramo: `seqs` é `%{id da mãe => último k usado}`, mesclado
  pelo máximo em `branch_seq`. O próximo ramo da mãe será `"<mãe>.<k + 1>"`.
  Serve para o boot restaurar contadores de ramos que não são carregados
  (extintos podados ou antigos), para um id de ramo nunca ser reaproveitado.
  """
  @spec reserve_branch_seq(t, %{String.t() => non_neg_integer}) :: t
  def reserve_branch_seq(%__MODULE__{branch_seq: seq} = sim, seqs) do
    %{sim | branch_seq: Map.merge(seq, seqs, fn _, a, b -> max(a, b) end)}
  end

  defp add_founders(sim, _sp, 0), do: sim

  defp add_founders(%{bounds: bounds} = sim, sp, n) do
    # Com catálogo, as fundadoras de espécie com planta recebem o genoma dela.
    {gid, sim} =
      case {sim.catalog, Map.get(sp, :blueprint)} do
        {nil, _} -> {nil, sim}
        {_, nil} -> {nil, sim}
        {_, bp} -> ensure_genome(sim, bp, fn -> sp end)
      end

    {{cx, y, cz}, rng} = random_position(%{diet: nil}, bounds, sim.rng)
    r = eff_radius(sp, bounds)

    {founders, rng} =
      Enum.map_reduce(1..n, rng, fn k, rng ->
        {u, rng} = :rand.uniform_s(rng)
        {a, rng} = uniform_range(rng, 0.0, 2 * :math.pi())
        {yaw, rng} = uniform_range(rng, -:math.pi(), :math.pi())
        {mode_left, rng} = initial_mode_left(sp, rng)
        rho = @founder_spread * :math.sqrt(u)
        pos = keep_out_sponges({cx + rho * :math.cos(a), y, cz + rho * :math.sin(a)}, r, bounds)

        {%Organism{
           id: "#{sp.code}-#{k |> Integer.to_string() |> String.pad_leading(4, "0")}",
           species: sp.id,
           born_ms: sim.now_ms,
           pos: pos,
           yaw: yaw,
           mode: :run,
           mode_left: mode_left,
           energy: 0.9 * sp.energy_max,
           stage: :adult,
           stage_ms: sim.now_ms,
           generation: 1,
           parent_id: nil,
           dividing_left: 0.0,
           genome: gid
         }, rng}
      end)

    %{sim | rng: rng, pending_founders: sim.pending_founders ++ founders}
  end

  # Só as 100 extintas criadas (id string) mais recentes ficam; as de teste
  # (id átomo) nunca saem, nem a ancestral (prefixo do id seguido de ".") de
  # uma espécie registrada viva. Some de `bounds`, `next_seq`, `populated` e
  # `extinct` juntos.
  defp prune_extinct(%{extinct: extinct} = sim) do
    created = for {id, ms} <- extinct, is_binary(id), do: {ms, id}

    if length(created) <= @max_extinct_created do
      sim
    else
      kept = ancestors_of_live(sim.bounds.species, extinct)

      drop =
        created
        |> Enum.reject(fn {_, id} -> MapSet.member?(kept, id) end)
        |> Enum.sort()
        |> Enum.take(length(created) - @max_extinct_created)
        |> MapSet.new(&elem(&1, 1))

      keep = fn id -> not MapSet.member?(drop, id) end
      list = Enum.filter(sim.bounds.species_list, &keep.(&1.id))

      bounds = %{
        sim.bounds
        | species: Map.filter(sim.bounds.species, fn {id, _} -> keep.(id) end),
          species_list: list
      }

      %{
        sim
        | bounds: bounds,
          next_seq: Map.filter(sim.next_seq, fn {id, _} -> keep.(id) end),
          populated: MapSet.filter(sim.populated, keep),
          pending_species: Enum.filter(sim.pending_species, &keep.(&1.id)),
          extinct: Map.filter(extinct, fn {id, _} -> keep.(id) end)
      }
    end
  end

  defp ancestors_of_live(by_id, extinct) do
    for {id, _} <- by_id,
        is_binary(id),
        not Map.has_key?(extinct, id),
        parts = String.split(id, "."),
        n <- 1..(length(parts) - 1)//1,
        into: MapSet.new(),
        do: parts |> Enum.take(n) |> Enum.join(".")
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
      particle_index: Particles.index(particles, now_ms),
      genomes: sim.genomes,
      grid: nil
    }

    # `prey_eaten`: ids comidos neste passo => espécie de quem comeu (cada presa
    # uma vez; quem processa primeiro, na ordem da lista, fica com ela).
    food = %{
      flora: flora,
      particles: particles,
      eaten_ids: [],
      bites: 0,
      takes: 0,
      wants: [],
      prey_eaten: %{},
      hunts_ok: 0,
      hunts_abandoned: 0,
      hunts_escaped: 0
    }

    # {i, id, pos, r, traits, vel, energy}, do começo do passo: i é a ordem da
    # lista, para a separação somar na mesma ordem e as buscas desempatarem;
    # traits são as características do organismo (`traits_of`, id = espécie).
    snapshot =
      orgs
      |> Enum.with_index(fn o, i ->
        {x, _, z} = o.pos
        traits = traits_of(env, o)
        r = Life.radius(o, traits, bounds.creature_scale, sim.ecology)
        {x, z, {i, o.id, o.pos, r, traits, o.vel, o.energy}}
      end)
      |> Grid.build()

    env = %{env | grid: snapshot}

    # Quem já foi comido neste passo não age mais: não anda, não come, não conta
    # a divisão (então não a conclui) e não pode ser comido de novo.
    {new_orgs, {rng, food}} =
      Enum.map_reduce(orgs, {rng, food}, fn o, {rng, food} ->
        if Map.has_key?(food.prey_eaten, o.id) do
          {o, {rng, food}}
        else
          {o, rng, food} = step_one(o, snapshot, env, dt, rng, food)
          {o, {rng, food}}
        end
      end)

    eaten = food.prey_eaten
    food = %{food | wants: Enum.reject(food.wants, &Map.has_key?(eaten, &1))}

    # Divisões: concluem (nascidos no fim da lista) antes de remover os mortos,
    # então o filho de um pai que morre neste passo nasce mesmo assim — também o
    # de uma presa que concluiu a divisão no seu próprio passo e depois foi comida.
    # A mutação no nascimento usa o rng do passo (encadeado: determinístico).
    {new_orgs, births, sim, rng} = complete_divisions(orgs, new_orgs, sim, now_ms, rng)
    {new_orgs, cap_holds} = start_divisions(new_orgs, births, food.wants, sim)
    new_orgs = new_orgs ++ sim.pending_founders ++ births

    # Remoção única no fim: comidos (:predation, sem corpo), fome e velhice.
    {survivors, dead} =
      Enum.split_with(new_orgs, fn o ->
        not Map.has_key?(eaten, o.id) and
          Life.death_cause(o, traits_of(sim, o), now_ms) == nil
      end)

    {food, corpse_events, rng} = bury(dead, eaten, food, sim, now_ms, rng)

    # Ramos: na varredura periódica, depois da remoção dos mortos e antes da
    # extinção (a mãe que passou todos para o ramo se extingue neste passo).
    {survivors, sim, branches, rebranch} =
      if now_ms >= sim.next_scan_ms do
        {sim, branches, rebranch} = Branching.scan(%{sim | organisms: survivors, now_ms: now_ms})
        {sim.organisms, sim, branches, rebranch}
      else
        {survivors, sim, [], []}
      end

    # Extinção decidida só aqui, depois de mortes e nascimentos do passo.
    next_seq = sim.next_seq

    {extinct, new_extinct} =
      detect_extinct(survivors, next_seq, sim.populated, sim.extinct, now_ms)

    # Genomas criados no passo (e no registro de espécies desde o passo anterior).
    new_genomes =
      for gid <- Enum.sort(sim.pending_genomes),
          do: {gid, Map.fetch!(sim.genomes, gid).bp}

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
        extinct: extinct,
        pending_species: [],
        pending_founders: [],
        pending_genomes: [],
        life_events: %{
          @no_life
          | deaths: corpse_events.deaths,
            births: sim.pending_founders ++ births,
            extinct: new_extinct,
            species: sim.pending_species,
            genomes: new_genomes,
            branches: branches,
            rebranch: rebranch,
            dead_by: corpse_events.dead_by,
            extinct_causes: extinct_causes(new_extinct, corpse_events.dead_by)
        },
        # Fundadoras não são nascimentos da ecologia: só as divisões contam.
        eco_totals:
          sim.eco_totals
          |> count_deaths(corpse_events.dead_by)
          |> count_births(births)
          |> Map.update!(:cap_holds, &(&1 + cap_holds))
          |> Map.update!(:hunts_ok, &(&1 + food.hunts_ok))
          |> Map.update!(:hunts_abandoned, &(&1 + food.hunts_abandoned))
          |> Map.update!(:hunts_escaped, &(&1 + food.hunts_escaped))
          |> Map.update!(:branches, &(&1 + length(branches)))
    }
    |> prune_extinct()
    |> scan(now_ms)
  end

  # Causa de cada extinção do passo: a última morte da espécie no passo, ou
  # `:branched` quando ninguém dela morreu (todos passaram para ramos).
  defp extinct_causes([], _dead_by), do: %{}

  defp extinct_causes(new_extinct, dead_by) do
    last =
      Enum.reduce(dead_by, %{}, fn {sp, cause, pred}, acc -> Map.put(acc, sp, {cause, pred}) end)

    Map.new(new_extinct, fn {id, _ms} -> {id, Map.get(last, id, {:branched, nil})} end)
  end

  # Espécie que já teve indivíduos (`next_seq` > 1, ou povoada por um ramo) e
  # agora não tem nenhum entra em `extinct` com o ms do passo; nunca sai.
  defp detect_extinct(survivors, next_seq, populated, extinct, now_ms) do
    present = MapSet.new(survivors, & &1.species)

    new =
      for {id, seq} <- next_seq,
          seq > 1 or MapSet.member?(populated, id),
          not Map.has_key?(extinct, id),
          not MapSet.member?(present, id),
          do: {id, now_ms}

    {Enum.into(new, extinct), Enum.sort(new)}
  end

  # Quem tinha `dividing_left > 0` e zerou neste passo termina a divisão: o pai
  # fica com split_parent × energy_max e nasce um jovem ao lado dele. Devolve o
  # `sim` com `next_seq` e os genomas (novos em `pending_genomes`) atualizados.
  defp complete_divisions(old_orgs, new_orgs, sim, now_ms, rng) do
    old_orgs
    |> Enum.zip(new_orgs)
    |> Enum.map_reduce({[], sim, rng}, fn {old, o}, {born, sim, rng} ->
      if old.dividing_left > 0 and o.dividing_left == 0 do
        sp = traits_of(sim, o)
        n = Map.fetch!(sim.next_seq, o.species)
        {child, sim, rng} = newborn(o, sp, n, sim, now_ms, rng)
        parent = %{o | energy: sim.ecology.split_parent * sp.energy_max}

        {parent,
         {[child | born], %{sim | next_seq: Map.put(sim.next_seq, o.species, n + 1)}, rng}}
      else
        {o, {born, sim, rng}}
      end
    end)
    |> then(fn {orgs, {born, sim, rng}} -> {orgs, Enum.reverse(born), sim, rng} end)
  end

  # Genoma do filho: sem genoma no pai, nenhum; sem catálogo, o do pai; senão a
  # planta do pai passa por `Mutation.child` e o genoma é achado ou criado.
  defp inherit(%{genome: nil}, _sp, sim, rng), do: {nil, false, sim, rng}
  defp inherit(%{genome: gid}, _sp, %{catalog: nil} = sim, rng), do: {gid, false, sim, rng}

  defp inherit(%{genome: gid}, sp, %{catalog: cat} = sim, rng) do
    bp = Map.fetch!(sim.genomes, gid).bp
    {child_bp, mutated, rng} = Mutation.child(bp, cat, rng)

    if child_bp == bp do
      {gid, mutated, sim, rng}
    else
      traits = fn -> Traits.species(child_bp, cat, %{id: sp.id, code: sp.code, name: sp.name}) end
      {child_gid, sim} = ensure_genome(sim, child_bp, traits)
      {child_gid, mutated, sim, rng}
    end
  end

  defp newborn(parent, sp, n, sim, now_ms, rng) do
    {genome, mutated, sim, rng} = inherit(parent, sp, sim, rng)
    r = Life.radius(parent, sp, sim.bounds.creature_scale, sim.ecology)
    side = parent.yaw + :math.pi() / 2
    {x, y, z} = parent.pos

    child = %Organism{
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
      dividing_left: 0.0,
      genome: genome,
      mutated: mutated
    }

    {child, sim, rng}
  end

  # Quem quer dividir (energia cheia) começa se houver vaga: população mais
  # divisões em curso (e nascidos e fundadoras deste passo) abaixo de pop_cap.
  # Sem vaga, conta um cap_hold e tenta de novo no passo seguinte.
  defp start_divisions(orgs, _births, [], _sim), do: {orgs, 0}

  defp start_divisions(orgs, births, wants, %{ecology: eco} = sim) do
    in_course = Enum.count(orgs, &(&1.dividing_left > 0))
    used = length(orgs) + length(births) + length(sim.pending_founders) + in_course

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
           %{o | energy: traits_of(sim, o).energy_max}

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
  # que entram também em `spawned` para o fio mandá-las. Predação: a presa some
  # sem corpo (a causa vale mesmo que ela também estivesse morrendo de outra).
  defp bury(dead, eaten, food, sim, now_ms, rng) do
    {base, per_r} = sim.ecology.corpse_particles

    acc0 = {food, %{deaths: [], spawned: [], dead_by: []}, rng}

    {food, events, rng} =
      Enum.reduce(dead, acc0, fn o, {food, ev, rng} ->
        sp = traits_of(sim, o)
        predator = Map.get(eaten, o.id)
        predation? = predator != nil
        cause = if predation?, do: :predation, else: Life.death_cause(o, sp, now_ms)
        r = Life.radius(o, sp, sim.bounds.creature_scale, sim.ecology)
        n = if predation?, do: 0, else: round(base + per_r * r)

        {particles, born, rng} =
          if n > 0,
            do: Particles.add_corpse(food.particles, o.pos, n, now_ms, rng),
            else: {food.particles, [], rng}

        {%{food | particles: particles},
         %{
           ev
           | deaths: [{o.id, cause} | ev.deaths],
             spawned: ev.spawned ++ born,
             dead_by: [{o.species, cause, predator} | ev.dead_by]
         }, rng}
      end)

    {food, %{events | deaths: Enum.reverse(events.deaths), dead_by: Enum.reverse(events.dead_by)},
     rng}
  end

  defp count_deaths(eco_totals, dead_by) do
    deaths =
      Enum.reduce(dead_by, eco_totals.deaths, fn {sp, cause, _pred}, acc ->
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

  @doc "Medições ecológicas para /api/stats."
  @spec eco_stats(t) :: map
  def eco_stats(%__MODULE__{organisms: orgs, eco_totals: t, extinct: extinct}) do
    by_cause = fn cause ->
      t.deaths |> Map.values() |> Enum.map(&Map.get(&1, cause, 0)) |> Enum.sum()
    end

    %{
      population_by_species: Enum.frequencies_by(orgs, & &1.species),
      births_total: t.births |> Map.values() |> Enum.sum(),
      deaths_total: %{
        starvation: by_cause.(:starvation),
        predation: by_cause.(:predation),
        old_age: by_cause.(:old_age)
      },
      hunts_ok: t.hunts_ok,
      hunts_abandoned: t.hunts_abandoned,
      hunts_escaped: t.hunts_escaped,
      cap_holds: t.cap_holds,
      branches_total: t.branches,
      extinct: extinct
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
    sp = traits_of(env, o)
    r = Life.radius(o, sp, bounds.creature_scale, env.eco)
    sdt = :math.sqrt(dt)

    {n1, rng} = :rand.normal_s(rng)
    {n2, rng} = :rand.normal_s(rng)
    yaw = o.yaw + n1 * sp.wander * sdt
    pitch = clamp(o.pitch * 0.98 + n2 * 0.3 * sp.wander * sdt, -0.35, 0.35)

    {mode, mode_left, yaw, rng} = advance_mode(sp, o.mode, o.mode_left - dt, yaw, rng)

    dividing? = o.dividing_left > 0

    dir = {:math.cos(pitch) * :math.cos(yaw), :math.sin(pitch), :math.cos(pitch) * :math.sin(yaw)}

    {o, seek, food} =
      if dividing? do
        left = o.dividing_left - dt

        {%{o | dividing_left: if(left <= @divide_eps, do: 0.0, else: left), target: nil}, @zero,
         food}
      else
        forage(o, sp, r, dt, env, food)
      end

    food =
      if not dividing? and Life.wants_divide?(o, sp),
        do: %{food | wants: [o.id | food.wants]},
        else: food

    # Quem divide só estica devagar: não foge nem anda em cardume.
    {flee, school} =
      if dividing?,
        do: {@zero, @zero},
        else: {flee(o, sp, r, env), Hunt.school_steer(o, sp, snapshot, env.eco)}

    # Caçando ou fugindo, o arranque manda: sem o vagar de cruzeiro, e o teto de
    # velocidade sobe ao do steer mais forte (max_speed × burst).
    urgent? = flee != @zero or match?({:prey, _}, o.target)

    target =
      cond do
        urgent? -> 0.0
        mode == :pause -> 0.0
        dividing? -> sp.max_speed * @divide_speed
        true -> sp.max_speed
      end

    desired =
      dir
      |> scale(target)
      |> add(edge_steer(o.pos, bounds, sp.max_speed))
      |> add(sponge_steer(o.pos, r, bounds, sp.max_speed))
      |> add(separation(o, sp, r, snapshot, bounds.max_r))
      |> add(seek)
      |> add(flee)
      |> add(school)

    cap = sp.max_speed |> max(norm(seek)) |> max(norm(flee))
    k = min(1.0, sp.turn_rate * dt)
    vel = o.vel |> add(scale(sub(desired, o.vel), k)) |> clamp_norm(cap)

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

  defp forage(o, %{diet: {:prey, _}} = sp, r, dt, env, food), do: hunt(o, sp, r, dt, env, food)
  defp forage(o, %{diet: :predator} = sp, r, dt, env, food), do: hunt(o, sp, r, dt, env, food)

  defp forage(o, sp, r, dt, env, food) do
    sated = max(o.sated_left - dt, 0.0)

    if sated > 0 or o.energy >= sp.energy_max do
      {%{o | sated_left: sated, target: nil}, @zero, food}
    else
      o = %{o | sated_left: 0.0}

      case valid_target(o.target, env, food) || find_target(o, sp, env, food) do
        nil -> {%{o | target: nil}, drift(o, sp, env), food}
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
  defp drift(o, sp, %{bounds: bounds, eco: eco}) do
    {cx, cz} = Map.fetch!(bounds.richest, sp.diet)
    {x, _, z} = o.pos
    {ux, _, uz} = unit({cx - x, 0.0, cz - z})
    w = Map.get(eco, :drift_weight, @drift_weight) * sp.max_speed
    {ux * w, 0.0, uz * w}
  end

  # --- caça e fuga --------------------------------------------------------------
  # O caçador faminto (energia < hunt_below × energy_max e sem saciedade) escolhe
  # a presa válida mais próxima pela grade do passo e a persegue a
  # max_speed × burst (× (1 − cover/2) dentro de cobertura). A presa é vista a
  # perception × (1 − cover da região dela). A perseguição é abandonada
  # (hunts_abandoned) depois de give_up_s, se a presa passa de 1,2 × esse
  # alcance, deixa de caber pelo porte ou some (inclusive comida por outro).
  # Posições e energia da presa são as do começo do passo (a grade).

  defp hunt(o, sp, r, dt, env, food) do
    sated = max(o.sated_left - dt, 0.0)
    o = %{o | sated_left: sated}

    cond do
      sated > 0 or o.energy >= env.eco.hunt_below * sp.energy_max ->
        {%{o | target: nil, chase_left: 0.0}, @zero, food}

      match?({:prey, _}, o.target) ->
        continue_chase(o, sp, r, dt, env, food)

      true ->
        start_chase(o, sp, r, env, food)
    end
  end

  defp start_chase(o, sp, r, env, food) do
    {x, _, z} = o.pos

    best =
      env.grid
      |> Grid.near(x, z, sp.perception)
      |> Enum.reduce(nil, fn {i, id, pos, pr, psp, _v, _e} = item, best ->
        d = dist(o.pos, pos)

        if id != o.id and not Map.has_key?(food.prey_eaten, id) and
             not ignored?(o.gave_up, id, env.now_ms) and closer?(d, i, best) and
             Hunt.can_eat?(sp, r, psp, pr) and
             d <= Hunt.perceived_range(sp.perception, Hunt.cover_at(env.bounds, pos)),
           do: {d, i, item},
           else: best
      end)

    case best do
      nil ->
        {%{o | target: nil, chase_left: 0.0}, @zero, food}

      {_, _, {_, id, _, _, _, _, _} = prey} ->
        o = %{o | target: {:prey, id}, chase_left: env.eco.give_up_s * 1.0}
        approach_or_catch(o, prey, sp, r, env, food)
    end
  end

  defp continue_chase(%{target: {:prey, id}} = o, sp, r, dt, env, food) do
    left = o.chase_left - dt
    prey = if left > @divide_eps, do: chased(o, id, sp, r, env, food)

    if prey do
      approach_or_catch(%{o | chase_left: left}, prey, sp, r, env, food)
    else
      # Desistir vale: a presa abandonada fica ignorada por give_up_s (outras podem ser caçadas).
      until = env.now_ms + round(env.eco.give_up_s * 1000)

      {%{o | target: nil, chase_left: 0.0, gave_up: {id, until}}, @zero,
       %{food | hunts_abandoned: food.hunts_abandoned + 1}}
    end
  end

  defp ignored?({id, until}, id, now_ms), do: now_ms < until
  defp ignored?(_gave_up, _id, _now_ms), do: false

  # A presa perseguida, se ainda vale: não comida, ao alcance e menor.
  defp chased(o, id, sp, r, env, food) do
    {x, _, z} = o.pos

    if not Map.has_key?(food.prey_eaten, id) do
      env.grid
      |> Grid.near(x, z, sp.perception * 1.2)
      |> Enum.find(fn {_, pid, pos, pr, psp, _, _} ->
        pid == id and Hunt.can_eat?(sp, r, psp, pr) and
          dist(o.pos, pos) <=
            1.2 * Hunt.perceived_range(sp.perception, Hunt.cover_at(env.bounds, pos))
      end)
    end
  end

  defp approach_or_catch(o, {_, id, ppos, pr, psp, _, pe}, sp, r, env, food) do
    if dist(o.pos, ppos) <= r + pr + @eat_margin do
      escape = Map.get(psp, :escape, 0.0)

      if escape > 0 and Hunt.escapes?(escape, o.id, id, env.now_ms),
        do: escaped(o, id, env, food),
        else: catch_prey(o, id, pe, sp, env, food)
    else
      speed = sp.max_speed * sp.burst * (1 - Hunt.cover_at(env.bounds, o.pos) / 2)
      {o, ppos |> sub(o.pos) |> unit() |> scale(speed), food}
    end
  end

  # A presa escapou do bote: o caçador a ignora por give_up_s, sem ganho nem saciedade.
  defp escaped(o, id, env, food) do
    until = env.now_ms + round(env.eco.give_up_s * 1000)

    {%{o | target: nil, chase_left: 0.0, gave_up: {id, until}}, @zero,
     %{food | hunts_escaped: food.hunts_escaped + 1}}
  end

  defp catch_prey(o, id, pe, sp, env, food) do
    o = Life.gain(o, sp, env.eco.prey_base + env.eco.prey_yield * pe)

    {%{o | target: nil, chase_left: 0.0, sated_left: sp.sated_s * 1.0}, @zero,
     %{food | prey_eaten: Map.put(food.prey_eaten, id, o.species), hunts_ok: food.hunts_ok + 1}}
  end

  # Só quem alguma espécie caça procura ameaça (atalho; a regra é a de Hunt.threat).
  defp flee(o, sp, r, %{bounds: bounds, grid: grid}) do
    with true <- bounds.hunted == :all or MapSet.member?(bounds.hunted, o.species),
         pos when pos != nil <- Hunt.threat(o, sp, r, grid, bounds) do
      Hunt.flee_steer(o, sp, pos, bounds)
    else
      _ -> @zero
    end
  end

  defp closer?(_d, _i, nil), do: true
  defp closer?(d, i, {bd, bi, _}), do: d < bd or (d == bd and i < bi)

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
    |> Enum.reduce({0.0, 0.0, 0.0}, fn {_i, id, pos, r, _sp, _vel, _e}, acc ->
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
