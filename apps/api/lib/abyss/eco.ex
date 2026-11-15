defmodule Abyss.Eco do
  @moduledoc """
  Experimento ecológico offline e repetível: roda o `Sim` puro em passo fixo de
  0,1 s (o relógio do mundo deriva do passo, não do relógio real) e devolve uma
  linha por minuto simulado.
  """

  alias Abyss.Genesis.{Catalog, Random, Traits}
  alias Abyss.World.Map, as: WMap
  alias Abyss.World.Sim

  @dt 0.1
  @steps_per_minute 600

  @doc """
  `opts`: `seed` (padrão 1), `minutes` (padrão 10), `population` (padrão o da
  configuração do mundo), `food_boost` (padrão o da configuração do mundo, 1.0;
  só para medição, ver `Sim.boost_food/2`), `mutation_boost` (padrão o da
  configuração do mundo, 1.0; só para medição: `part_p` × k), `test_species` (padrão o da
  configuração do mundo) e `genesis` (padrão 0: quantas espécies
  `Random.blueprint` somar, 3 fundadoras cada, ids `sp1`…, sorteio próprio da semente). Cada linha: `%{minute, pop, births, births_by, deaths,
  hunts_ok, hunts_escaped, extinct, alive, branches_total, trees_alive, predators}`;
  `births`, `deaths` e `hunts_*` contam só aquele minuto, `pop` é o fim dele.
  `pop` e `births_by` somam a árvore inteira de cada espécie inicial (ela e os
  ramos, pelo `root`); `trees_alive` conta as árvores com algum vivo;
  `predators` conta os vivos de dieta predadora (pelo genoma) nas árvores criadas
  (com planta); `alive` é o total de vivos.
  """
  @spec run(keyword) :: [map]
  def run(opts) do
    seed = Keyword.get(opts, :seed, 1)
    minutes = Keyword.get(opts, :minutes, 10)
    world = Application.fetch_env!(:abyss, :world)
    population = Keyword.get(opts, :population) || Keyword.fetch!(world, :population)
    boost = Keyword.get(opts, :food_boost) || Keyword.get(world, :food_boost, 1.0)

    mutation_boost =
      Keyword.get(opts, :mutation_boost) || Keyword.get(world, :mutation_boost, 1.0)

    test_species = Keyword.get(opts, :test_species, Keyword.fetch!(world, :test_species))

    sim =
      Sim.new(%{
        population: population,
        seed: seed,
        now_ms: 0,
        map: WMap.load!(Application.fetch_env!(:abyss, :map_path)),
        creature_scale: Keyword.fetch!(world, :creature_scale),
        test_species: test_species,
        food: :abyss |> Application.fetch_env!(:food) |> Map.new() |> Sim.boost_food(boost),
        ecology: :abyss |> Application.fetch_env!(:ecology) |> Map.new(),
        catalog: Catalog.get(),
        mutation_boost: mutation_boost
      })

    sim = add_genesis(sim, Keyword.get(opts, :genesis, 0), seed)
    # Sem as de teste, só as criadas viram colunas (as de teste ficam registradas, sem vivos).
    ids =
      for sp <- Sim.species(sim), test_species or Map.get(sp, :blueprint) != nil, do: sp.id

    {rows, _} =
      Enum.map_reduce(1..minutes//1, {sim, roots(sim, %{})}, fn minute, {sim, roots} ->
        before = Sim.eco_stats(sim)
        before_by = by_tree(roots, sim.eco_totals.births)
        sim = Enum.reduce(1..@steps_per_minute, sim, fn _, s -> Sim.step(s, @dt) end)
        now = Sim.eco_stats(sim)
        # Raízes acumuladas: um ramo podado no minuto continua na sua árvore.
        roots = roots(sim, roots)
        pop = by_tree(roots, now.population_by_species)
        births_by = by_tree(roots, sim.eco_totals.births)

        row = %{
          minute: minute,
          pop: Map.new(ids, &{&1, Map.get(pop, &1, 0)}),
          births: now.births_total - before.births_total,
          births_by: Map.new(ids, &{&1, Map.get(births_by, &1, 0) - Map.get(before_by, &1, 0)}),
          deaths: Map.new(now.deaths_total, fn {c, n} -> {c, n - before.deaths_total[c]} end),
          hunts_ok: now.hunts_ok - before.hunts_ok,
          hunts_escaped: now.hunts_escaped - before.hunts_escaped,
          extinct: now.extinct,
          alive: length(sim.organisms),
          branches_total: now.branches_total,
          trees_alive: Enum.count(ids, &(Map.get(pop, &1, 0) > 0)),
          predators: predators(sim)
        }

        {row, {sim, roots}}
      end)

    rows
  end

  # id da espécie -> raiz da árvore (`root` do ramo; a raiz é ela mesma), somado ao já visto.
  defp roots(sim, acc) do
    sim |> Sim.species() |> Enum.reduce(acc, &Map.put(&2, &1.id, Map.get(&1, :root, &1.id)))
  end

  # Soma uma contagem por espécie na raiz da sua árvore.
  defp by_tree(roots, counts) do
    Enum.reduce(counts, %{}, fn {id, n}, acc ->
      Map.update(acc, Map.get(roots, id, id), n, &(&1 + n))
    end)
  end

  # Vivos de dieta predadora (a do genoma) nas árvores criadas (espécie com planta).
  defp predators(sim) do
    Enum.count(sim.organisms, fn o ->
      Map.get(sim.bounds.species[o.species], :blueprint) != nil and
        Sim.traits_of(sim, o).diet == :predator
    end)
  end

  defp add_genesis(sim, n, _seed) when n <= 0, do: sim

  defp add_genesis(sim, n, seed) do
    catalog = Catalog.get()

    {sim, _rng} =
      Enum.reduce(1..n, {sim, :rand.seed_s(:exsss, {seed, 0x5EED, 1})}, fn i, {sim, rng} ->
        {bp, rng} = Random.blueprint(rng, catalog)

        code =
          "S" <> (i |> Integer.to_string(36) |> String.pad_leading(2, "0") |> String.upcase())

        sp = Traits.species(bp, catalog, %{id: "sp#{i}", code: code, name: "Gênese #{i}"})
        {Sim.add_species(sim, sp, founders: 3), rng}
      end)

    sim
  end
end
