defmodule Abyss.Repo.Migrations.CreateWorldSnapshots do
  use Ecto.Migration

  def change do
    create table(:world_snapshots) do
      add :epoch, :integer, null: false
      add :tick, :bigint, null: false
      add :world_ms, :bigint, null: false
      add :saved_at, :utc_datetime_usec, null: false
      add :format_version, :integer, null: false
      add :rules_version, :integer, null: false
      add :checksum, :binary, null: false
      add :data, :binary, null: false
    end
  end
end
