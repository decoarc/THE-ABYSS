defmodule Mix.Tasks.Abyss.Eco do
  @shortdoc "Roda um experimento ecológico offline e imprime CSV por minuto"
  @moduledoc """
  Uso: `mix abyss.eco --seed N --minutes M [--population P] [--food-boost K] [--mutation-boost K] [--genesis N] [--[no-]test-species]`.

  `--genesis N` soma N espécies sorteadas (3 fundadoras cada), colunas `pop_sp1`…
  (cada uma soma a árvore inteira: a espécie e os seus ramos).

  `--no-test-species` tira as espécies de teste do E1 (padrão: o da configuração do mundo).

  `--food-boost` (só para medição) multiplica a comida, ver `Abyss.World.Sim.boost_food/2`.

  `--mutation-boost` (só para medição) multiplica `part_p` do catálogo (teto 1).

  Imprime uma linha CSV por minuto simulado (passo fixo de 0,1 s, repetível
  pela semente): população por espécie, nascimentos, mortes por causa e botes (certos e
  escapados pela placa), ramos registrados até ali (`branches_total`), árvores
  com algum vivo (`trees_alive`), predadores vivos nas árvores criadas
  (`predators`) e total de vivos (`alive`).
  """

  use Mix.Task

  @switches [
    seed: :integer,
    minutes: :integer,
    population: :integer,
    food_boost: :float,
    mutation_boost: :float,
    genesis: :integer,
    test_species: :boolean
  ]

  @impl Mix.Task
  def run(args) do
    Mix.Task.run("app.config")
    Application.put_env(:abyss, :start_world, false)
    Mix.Task.run("app.start")
    args |> csv() |> IO.write()
  end

  @doc "Roda o experimento de `args` (as opções da tarefa) e devolve o CSV inteiro."
  @spec csv([String.t()]) :: String.t()
  def csv(args) do
    {opts, _, _} = OptionParser.parse(args, strict: @switches)
    rows = Abyss.Eco.run(opts)
    ids = rows |> List.first(%{pop: %{}}) |> Map.fetch!(:pop) |> Map.keys() |> Enum.sort()
    causes = [:starvation, :predation, :old_age]

    header =
      ["minute"] ++
        Enum.map(ids, &"pop_#{&1}") ++
        ["births"] ++
        Enum.map(ids, &"births_#{&1}") ++
        Enum.map(causes, &"deaths_#{&1}") ++
        ["hunts_ok", "hunts_escaped", "branches_total", "trees_alive", "predators", "alive"]

    lines =
      for r <- rows do
        [r.minute] ++
          Enum.map(ids, &r.pop[&1]) ++
          [r.births] ++
          Enum.map(ids, &r.births_by[&1]) ++
          Enum.map(causes, &r.deaths[&1]) ++
          [r.hunts_ok, r.hunts_escaped, r.branches_total, r.trees_alive, r.predators, r.alive]
      end

    Enum.map_join([header | lines], &(Enum.join(&1, ",") <> "\n"))
  end
end
