defmodule Abyss.Genesis.DeathCount do
  @moduledoc """
  Mortes de uma espécie criada (ou ramo) num intervalo de 5 min do relógio do mundo,
  por causa e predador. `tick` é o último tick contado na linha: ao voltar de uma
  fotografia, as linhas com tick depois dela são descartadas (ver `Abyss.World.Boot`).
  Linhas só são inseridas; a leitura soma as da mesma chave.
  """

  use Ecto.Schema

  @bucket_ms 300_000

  schema "death_counts" do
    field :species_id, :string
    field :epoch, :integer
    field :bucket_ms, :integer
    field :cause, :string
    field :predator_id, :string
    field :n, :integer
    field :tick, :integer
  end

  @doc "Tamanho do intervalo, em ms do relógio do mundo."
  def bucket_ms, do: @bucket_ms

  @doc "Início do intervalo que contém `world_ms`."
  def bucket(world_ms), do: Integer.floor_div(world_ms, @bucket_ms) * @bucket_ms
end
