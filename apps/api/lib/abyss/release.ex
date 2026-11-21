defmodule Abyss.Release do
  @moduledoc """
  Tarefas da release, sem Mix: `bin/abyss eval 'Abyss.Release.migrate()'` (gate O).
  """

  @app :abyss

  def migrate do
    Application.ensure_all_started(:ssl)
    Application.load(@app)

    for repo <- Application.fetch_env!(@app, :ecto_repos) do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end
end
