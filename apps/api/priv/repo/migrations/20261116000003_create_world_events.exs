defmodule Abyss.Repo.Migrations.CreateWorldEvents do
  use Ecto.Migration

  def change do
    # "restart": mundo recomeçado (fotografia ausente ou incompatível); "pause": servidor
    # parado de `at` até `until` (mundo congelado).
    create table(:world_events) do
      add :kind, :text, null: false
      add :epoch, :integer, null: false
      add :at, :utc_datetime_usec, null: false
      add :until, :utc_datetime_usec
      add :meta, :map, null: false, default: %{}
    end

    create index(:world_events, [:kind, :at])
  end
end
