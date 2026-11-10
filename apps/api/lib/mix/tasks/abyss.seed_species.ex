defmodule Mix.Tasks.Abyss.SeedSpecies do
  @shortdoc "Semeia espécies sorteadas no banco (só dev, para medição)"
  @moduledoc """
  Uso: `mix abyss.seed_species --count N --seed S`. Só roda com
  `config :abyss, :allow_seed, true` (dev); recusa em qualquer outro ambiente.
  """

  use Mix.Task

  @impl Mix.Task
  def run(args) do
    {opts, _, _} = OptionParser.parse(args, strict: [count: :integer, seed: :integer])
    Mix.Task.run("app.config")

    unless Application.get_env(:abyss, :allow_seed, false) do
      Mix.shell().error("abyss.seed_species só roda em desenvolvimento.")
      exit({:shutdown, 1})
    end

    Application.put_env(:abyss, :start_world, false)
    Mix.Task.run("app.start")

    count = Keyword.get(opts, :count, 3)
    Abyss.Genesis.seed!(count, Keyword.get(opts, :seed, 1))
    Mix.shell().info("#{count} espécies semeadas.")
  end
end
