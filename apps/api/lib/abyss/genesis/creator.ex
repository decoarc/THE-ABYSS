defmodule Abyss.Genesis.Creator do
  use Ecto.Schema
  import Ecto.Changeset

  # O e-mail nunca pode aparecer em logs.
  @derive {Inspect, except: [:email_normalized]}
  schema "creators" do
    field :email_normalized, :string
    timestamps(type: :utc_datetime_usec, updated_at: false)
  end

  def changeset(creator, attrs) do
    creator
    |> cast(attrs, [:email_normalized])
    |> validate_required([:email_normalized])
    |> unique_constraint(:email_normalized)
  end
end
