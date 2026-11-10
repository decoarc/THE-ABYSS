defmodule Mix.Tasks.Abyss.Reset do
  @shortdoc "Apaga todas as espécies, criadores e tokens (exige --yes)"
  @moduledoc """
  Uso: `mix abyss.reset --yes`. Esvazia `species`, `creators` e
  `verification_tokens` e reinicia os ids. Sem `--yes` não apaga nada.
  """

  use Mix.Task

  @impl Mix.Task
  def run(args) do
    if confirmed?(args) do
      Mix.Task.run("app.config")
      Application.put_env(:abyss, :start_world, false)
      Mix.Task.run("app.start")
      Abyss.Genesis.reset!()
      Mix.shell().info("Banco da gênese zerado.")
    else
      Mix.shell().error(
        "Isto apaga TODAS as espécies, criadores e tokens. Rode de novo com --yes para confirmar."
      )

      exit({:shutdown, 1})
    end
  end

  @doc false
  def confirmed?(args) do
    {opts, _, _} = OptionParser.parse(args, strict: [yes: :boolean])
    opts[:yes] == true
  end
end
