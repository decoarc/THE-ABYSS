defmodule Abyss.World.WorldEvent do
  @moduledoc """
  Evento do mundo inteiro: `"restart"` (recomeço com `epoch` novo; aparece na árvore das
  espécies vivas naquele momento) ou `"pause"` (servidor fora de `at` até `until`; só
  para provas e operação, não aparece na tela).
  """

  use Ecto.Schema

  schema "world_events" do
    field :kind, :string
    field :epoch, :integer
    field :at, :utc_datetime_usec
    field :until, :utc_datetime_usec
    field :meta, :map, default: %{}
  end
end
