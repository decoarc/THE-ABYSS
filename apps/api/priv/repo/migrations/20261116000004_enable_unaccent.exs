defmodule Abyss.Repo.Migrations.EnableUnaccent do
  use Ecto.Migration

  # Busca de espécies sem diferenciar acento (gate P).
  def up, do: execute("CREATE EXTENSION IF NOT EXISTS unaccent")
  def down, do: execute("DROP EXTENSION IF EXISTS unaccent")
end
