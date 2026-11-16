defmodule Abyss.World.Snapshot do
  @moduledoc """
  Fotografia do mundo: o `Sim` inteiro num binário (`:erlang.term_to_binary`, comprimido),
  sem o mapa e sem o catálogo, que vêm do disco na volta. Os eventos do passo
  (`life_events`, `food_events`) vão vazios; os pendentes (espécies, fundadoras, genomas)
  vão junto. O sorteio vai exportado (`:rand.export_seed_s/1`), sem funções.

  ## Quando subir cada versão (design do gate P, §5.6)

  - `@format_version`: suba quando o formato só **ganhar campos** (um campo novo no `Sim`
    ou no `Organism`). A carga completa o que falta com o padrão do struct e o mundo
    continua com as mesmas criaturas. Uma fotografia de formato **mais novo** que o código
    é recusada (`:format`).
  - `@rules_version`: suba quando mudar **regra** (comer, caçar, morrer, dividir, mutar,
    ramificar) ou o **significado** de um campo. Versão diferente = recomeço do mundo,
    com o evento "mundo recomeçado" registrado.

  Na dúvida entre as duas, suba a de regras: recomeçar é seguro; continuar com um campo
  de significado trocado não é.
  """

  alias Abyss.World.{Organism, Sim}

  @format_version 1
  @rules_version 1

  @type ctx :: %{map: Abyss.World.Map.t(), catalog: map | nil, mutation_boost: number}

  @spec format_version() :: pos_integer
  def format_version, do: @format_version

  @spec rules_version() :: pos_integer
  def rules_version, do: @rules_version

  @spec encode(Sim.t()) :: binary
  def encode(%Sim{} = sim) do
    data =
      sim
      |> Map.from_struct()
      |> Map.merge(%{
        organisms: Enum.map(sim.organisms, &Map.from_struct/1),
        rng: :rand.export_seed_s(sim.rng),
        bounds: Map.delete(sim.bounds, :map),
        catalog: nil,
        life_events: %Sim{}.life_events,
        food_events: %Sim{}.food_events
      })

    :erlang.term_to_binary(
      %{
        format_version: @format_version,
        rules_version: @rules_version,
        map_id: sim.bounds.map.id,
        sim: data
      },
      [:compressed]
    )
  end

  @spec decode(binary, ctx) :: {:ok, Sim.t()} | {:error, :rules | :format | :map}
  def decode(bin, %{map: map} = ctx) when is_binary(bin) do
    case unpack(bin) do
      {:ok, %{format_version: f}} when f > @format_version -> {:error, :format}
      {:ok, %{rules_version: r}} when r != @rules_version -> {:error, :rules}
      {:ok, %{map_id: id}} when id != map.id -> {:error, :map}
      {:ok, %{sim: data}} -> rebuild(data, ctx)
      :error -> {:error, :format}
    end
  end

  @spec checksum(binary) :: binary
  def checksum(bin), do: :crypto.hash(:sha256, bin)

  defp unpack(bin) do
    case :erlang.binary_to_term(bin) do
      %{format_version: f, rules_version: r, map_id: _, sim: %{}} = p
      when is_integer(f) and is_integer(r) ->
        {:ok, p}

      _ ->
        :error
    end
  rescue
    ArgumentError -> :error
  end

  defp rebuild(data, ctx) do
    sim = struct(Sim, data)

    {:ok,
     %{
       sim
       | organisms: Enum.map(sim.organisms, &struct(Organism, &1)),
         rng: :rand.seed_s(sim.rng),
         bounds: Map.put(sim.bounds, :map, ctx.map),
         catalog: Sim.boost_mutation(Map.get(ctx, :catalog), Map.get(ctx, :mutation_boost, 1))
     }}
  rescue
    _ -> {:error, :format}
  end
end
