defmodule Abyss.Repo.Migrations.CreateDeathHistory do
  use Ecto.Migration

  def change do
    for table <- [:species, :branches] do
      alter table(table) do
        add :extinct_cause, :text
        add :extinct_predator_id, :text
        add :extinct_world_ms, :bigint
        add :extinct_epoch, :integer
      end
    end

    # Mortes de espécies criadas por intervalo de 5 min do relógio do mundo. Só inserção:
    # a leitura soma as linhas da mesma chave.
    create table(:death_counts) do
      add :species_id, :text, null: false
      add :epoch, :integer, null: false
      add :bucket_ms, :bigint, null: false
      add :cause, :text, null: false
      add :predator_id, :text
      add :n, :integer, null: false
      add :tick, :bigint, null: false
    end

    create index(:death_counts, [:species_id, :epoch, :bucket_ms])
    create index(:death_counts, [:epoch, :tick])
  end
end
