defmodule Abyss.World.SnapshotRecord do
  @moduledoc "Fotografia gravada do mundo (ver `Abyss.World.Snapshot` e `Abyss.World.Saver`)."

  use Ecto.Schema

  schema "world_snapshots" do
    field :epoch, :integer
    field :tick, :integer
    field :world_ms, :integer
    # Hora real da gravação.
    field :saved_at, :utc_datetime_usec
    field :format_version, :integer
    field :rules_version, :integer
    # SHA-256 de `data`.
    field :checksum, :binary
    field :data, :binary
  end
end
