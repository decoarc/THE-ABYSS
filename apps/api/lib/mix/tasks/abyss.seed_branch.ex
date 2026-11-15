defmodule Mix.Tasks.Abyss.SeedBranch do
  @shortdoc "Grava um ramo derivado de uma espécie criada (só dev/teste, para o e2e)"
  @moduledoc """
  Uso: `mix abyss.seed_branch --root N`. Insere em `branches` o ramo `sp<N>.<k>` com a planta da
  espécie criada N mais duas peças. Só roda com `config :abyss, :allow_seed, true` (dev).
  """

  use Mix.Task

  @impl Mix.Task
  def run(args) do
    {opts, _, _} = OptionParser.parse(args, strict: [root: :integer])
    Mix.Task.run("app.config")

    unless Application.get_env(:abyss, :allow_seed, false) do
      Mix.shell().error("abyss.seed_branch só roda em desenvolvimento.")
      exit({:shutdown, 1})
    end

    Application.put_env(:abyss, :start_world, false)
    Mix.Task.run("app.start")

    record = Abyss.Genesis.seed_branch!(Keyword.get(opts, :root, 1))
    Mix.shell().info("ramo #{record.id} (#{record.code}) gravado.")
  end
end
