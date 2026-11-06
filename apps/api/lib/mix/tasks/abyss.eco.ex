defmodule Mix.Tasks.Abyss.Eco do
  @shortdoc "Roda um experimento ecológico offline e imprime CSV por minuto"
  @moduledoc """
  Uso: `mix abyss.eco --seed N --minutes M [--population P] [--food-boost K]`.

  `--food-boost` (só para medição) multiplica a comida, ver `Abyss.World.Sim.boost_food/2`.

  Imprime uma linha CSV por minuto simulado (passo fixo de 0,1 s, repetível
  pela semente): população por espécie, nascimentos e mortes por causa.
  """

  use Mix.Task

  @switches [seed: :integer, minutes: :integer, population: :integer, food_boost: :float]

  @impl Mix.Task
  def run(args) do
    {opts, _, _} = OptionParser.parse(args, strict: @switches)
    Mix.Task.run("app.config")
    Application.put_env(:abyss, :start_world, false)
    Mix.Task.run("app.start")

    rows = Abyss.Eco.run(opts)
    ids = rows |> List.first(%{pop: %{}}) |> Map.fetch!(:pop) |> Map.keys() |> Enum.sort()
    causes = [:starvation, :predation, :old_age]

    header =
      ["minute"] ++
        Enum.map(ids, &"pop_#{&1}") ++
        ["births"] ++ Enum.map(ids, &"births_#{&1}") ++ Enum.map(causes, &"deaths_#{&1}")

    IO.puts(Enum.join(header, ","))

    for r <- rows do
      cols =
        [r.minute] ++
          Enum.map(ids, &r.pop[&1]) ++
          [r.births] ++ Enum.map(ids, &r.births_by[&1]) ++ Enum.map(causes, &r.deaths[&1])

      IO.puts(Enum.join(cols, ","))
    end
  end
end
