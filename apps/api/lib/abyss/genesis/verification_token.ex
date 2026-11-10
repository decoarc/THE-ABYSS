defmodule Abyss.Genesis.VerificationToken do
  use Ecto.Schema
  import Ecto.Changeset

  # O e-mail nunca pode aparecer em logs.
  schema "verification_tokens" do
    field :token_hash, :binary
    field :email_normalized, :string, redact: true
    field :name, :string
    field :blueprint, :map
    field :expires_at, :utc_datetime_usec
    timestamps type: :utc_datetime_usec, updated_at: false
  end

  def changeset(token, attrs) do
    token
    |> cast(attrs, [:token_hash, :email_normalized, :name, :blueprint, :expires_at])
    |> validate_required([:token_hash, :email_normalized, :name, :blueprint, :expires_at])
    |> unique_constraint(:token_hash)
  end
end
