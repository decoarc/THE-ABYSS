defmodule Abyss.Genesis.SpeciesRecord do
  use Ecto.Schema
  import Ecto.Changeset

  schema "species" do
    belongs_to :creator, Abyss.Genesis.Creator
    field :name, :string
    field :code, :string
    field :blueprint, :map
    field :ruleset, :string, default: "s1"
    field :published_at, :utc_datetime_usec
    field :extinct_at, :utc_datetime_usec
  end

  def changeset(record, attrs) do
    record
    |> cast(attrs, [:creator_id, :name, :code, :blueprint, :ruleset, :published_at, :extinct_at])
    |> validate_required([:creator_id, :name, :code, :blueprint, :ruleset, :published_at])
    |> unique_constraint(:creator_id)
    |> unique_constraint(:code)
  end
end
