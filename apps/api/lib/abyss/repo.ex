defmodule Abyss.Repo do
  use Ecto.Repo,
    otp_app: :abyss,
    adapter: Ecto.Adapters.Postgres
end
