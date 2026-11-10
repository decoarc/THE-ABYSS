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
  só para medição, ver `Sim.boost_food/2`) e `genesis` (padrão 0: quantas espécies
  `Random.blueprint` somar, 3 fundadoras cada, ids `sp1`…, sorteio próprio da semente). Cada linha: `%{minute, pop, births, births_by, deaths,
  extinct}`; `births` e `deaths` contam só aquele minuto, `pop` é o fim dele.
  """
  @spec run(keyword) :: [map]
  def run(opts) do
    seed = Keyword.get(opts, :seed, 1)
    minutes = Keyword.get(opts, :minutes, 10)
    world = Application.fetch_env!(:abyss, :world)
    population = Keyword.get(opts, :population) || Keyword.fetch!(world, :population)
    boost = Keyword.get(opts, :food_boost) || Keyword.get(world, :food_boost, 1.0)

    sim =
      Sim.new(%{
        population: population,
        seed: seed,
        now_ms: 0,
        map: WMap.load!(Application.fetch_env!(:abyss, :map_path)),
        creature_scale: Keyword.fetch!(world, :creature_scale),
        test_species: Keyword.fetch!(world, :test_species),
        food: :abyss |> Application.fetch_env!(:food) |> Map.new() |> Sim.boost_food(boost),
        ecology: :abyss |> Application.fetch_env!(:ecology) |> Map.new()
      })

    sim = add_genesis(sim, Keyword.get(opts, :genesis, 0), seed)
    ids = sim |> Sim.species() |> Enum.map(& &1.id)

    {rows, _} =
      Enum.map_reduce(1..minutes//1, sim, fn minute, sim ->
        before = Sim.eco_stats(sim)
        before_by = sim.eco_totals.births
        sim = Enum.reduce(1..@steps_per_minute, sim, fn _, s -> Sim.step(s, @dt) end)
        now = Sim.eco_stats(sim)

        row = %{
          minute: minute,
          pop: Map.new(ids, &{&1, Map.get(now.population_by_species, &1, 0)}),
          births: now.births_total - before.births_total,
          births_by:
            Map.new(ids, &{&1, Map.get(sim.eco_totals.births, &1, 0) - Map.get(before_by, &1, 0)}),
          deaths: Map.new(now.deaths_total, fn {c, n} -> {c, n - before.deaths_total[c]} end),
          extinct: now.extinct
        }

        {row, sim}
      end)

    rows
  end

  defp add_genesis(sim, n, _seed) when n <= 0, do: sim

  defp add_genesis(sim, n, seed) do
    catalog = Catalog.get()

    {sim, _rng} =
      Enum.reduce(1..n, {sim, :rand.seed_s(:exsss, seed)}, fn i, {sim, rng} ->
        {bp, rng} = Random.blueprint(rng, catalog)

        code =
          "S" <> (i |> Integer.to_string(36) |> String.pad_leading(2, "0") |> String.upcase())

        sp = Traits.species(bp, catalog, %{id: "sp#{i}", code: code, name: "Gênese #{i}"})
        {Sim.add_species(sim, sp, founders: 3), rng}
      end)

    sim
  end
end
