defmodule Abyss.Repo.Migrations.CreateGenesis do
  use Ecto.Migration

  def change do
    create table(:creators) do
      add :email_normalized, :text, null: false
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create unique_index(:creators, [:email_normalized])

    create table(:species) do
      add :creator_id, references(:creators, on_delete: :restrict), null: false
      add :name, :text, null: false
      add :code, :text, null: false
      add :blueprint, :map, null: false
      add :ruleset, :text, null: false, default: "s1"
      add :published_at, :utc_datetime_usec, null: false
      add :extinct_at, :utc_datetime_usec
    end

    create unique_index(:species, [:creator_id])
    create unique_index(:species, [:code])
    create index(:species, [:extinct_at])

    create table(:verification_tokens) do
      add :token_hash, :binary, null: false
      add :email_normalized, :text, null: false
      add :name, :text, null: false
      add :blueprint, :map, null: false
      add :expires_at, :utc_datetime_usec, null: false
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create unique_index(:verification_tokens, [:token_hash])
  end
end
