defmodule Abyss.Genesis.Catalog do
  @moduledoc """
  Catálogo de peças do gate S1, lido de `shared/genesis/catalog-s1.json` (o
  mesmo arquivo que o cliente importa). Chaves atômicas nos campos do topo e
  aninhados; os tipos de peça (`parts`) ficam com chave string.
  """

  @type t :: map

  @key {__MODULE__, :catalog}

  @spec load!(Path.t()) :: t
  def load!(path) do
    path |> File.read!() |> Jason.decode!() |> atomize()
  end

  @spec get() :: t
  def get do
    case :persistent_term.get(@key, nil) do
      nil ->
        cat = load!(Application.fetch_env!(:abyss, :catalog_path))
        :persistent_term.put(@key, cat)
        cat

      cat ->
        cat
    end
  end

  defp atomize(map) when is_map(map) do
    Map.new(map, fn
      {"parts", parts} ->
        {:parts, Map.new(parts, fn {kind, spec} -> {kind, atomize(spec)} end)}

      {k, v} ->
        {String.to_atom(k), atomize(v)}
    end)
  end

  defp atomize(other), do: other
end
