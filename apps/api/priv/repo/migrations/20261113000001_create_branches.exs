defmodule Abyss.Repo.Migrations.CreateBranches do
  use Ecto.Migration

  def change do
    create table(:branches, primary_key: false) do
      # id do Sim, ex. "sp3.1.2": a ancestralidade está no próprio id.
      add :id, :text, primary_key: true
      add :root_species_id, references(:species, on_delete: :delete_all), null: false
      add :parent_id, :text, null: false
      add :name, :text, null: false
      add :code, :text, null: false
      add :blueprint, :map, null: false
      add :region, :text
      add :born_at, :utc_datetime_usec, null: false
      add :extinct_at, :utc_datetime_usec
    end

    create unique_index(:branches, [:code])
    create index(:branches, [:root_species_id])
    create index(:branches, [:extinct_at])
  end
end
