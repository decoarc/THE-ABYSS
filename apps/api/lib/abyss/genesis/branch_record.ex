defmodule Abyss.Genesis.BranchRecord do
  @moduledoc """
  Ramo (subespécie) nascido no mundo. Sem criadora e sem e-mail: só descende de
  uma espécie criada (`root_species_id`). O id é o do `Sim` (ex. "sp3.1").
  """

  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :string, autogenerate: false}
  schema "branches" do
    belongs_to :root_species, Abyss.Genesis.SpeciesRecord
    field :parent_id, :string
    field :name, :string
    field :code, :string
    field :blueprint, :map
    field :region, :string
    field :born_at, :utc_datetime_usec
    field :extinct_at, :utc_datetime_usec
  end

  def changeset(record, attrs) do
    record
    |> cast(attrs, [
      :id,
      :root_species_id,
      :parent_id,
      :name,
      :code,
      :blueprint,
      :region,
      :born_at,
      :extinct_at
    ])
    |> validate_required([:id, :root_species_id, :parent_id, :name, :code, :blueprint, :born_at])
    |> unique_constraint(:id, name: :branches_pkey)
    |> unique_constraint(:code)
  end
end
