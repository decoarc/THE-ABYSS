defmodule Abyss.World.Grid do
  @moduledoc """
  Grade espacial uniforme no plano XZ, célula de 8 unidades. Dado puro (um
  mapa `{cx, cz} => [item]`), vive dentro do processo do mundo.

  A grade só reduz candidatos: quem consulta continua medindo a distância real
  e desempatando como a busca linear, então o resultado é o mesmo. Cada célula
  guarda os itens na ordem de inserção.
  """

  @cell 8.0

  @type t :: %{optional({integer, integer}) => [term]}

  @doc "Grade de pontos: cada item `{x, z, item}` entra na célula que contém (x, z)."
  @spec build([{number, number, term}]) :: t
  def build(entries) do
    entries
    |> Enum.reverse()
    |> Enum.reduce(%{}, fn {x, z, item}, grid ->
      Map.update(grid, {cell(x), cell(z)}, [item], &[item | &1])
    end)
  end

  @doc """
  Grade de discos: cada item `{x, z, r, item}` entra em toda célula que o
  quadrado envolvente do disco toca, então `at/3` em qualquer ponto do disco o
  devolve.
  """
  @spec build_discs([{number, number, number, term}]) :: t
  def build_discs(entries) do
    entries
    |> Enum.reverse()
    |> Enum.reduce(%{}, fn {x, z, r, item}, grid ->
      for cx <- cell(x - r)..cell(x + r)//1, cz <- cell(z - r)..cell(z + r)//1, reduce: grid do
        grid -> Map.update(grid, {cx, cz}, [item], &[item | &1])
      end
    end)
  end

  @doc "Itens das células que cobrem o quadrado [x ± r] × [z ± r] (todo ponto a até r de (x, z) está aqui)."
  @spec near(t, number, number, number) :: [term]
  def near(grid, x, z, r) do
    for cx <- cell(x - r)..cell(x + r)//1,
        cz <- cell(z - r)..cell(z + r)//1,
        item <- Map.get(grid, {cx, cz}, []),
        do: item
  end

  @doc "Itens da célula que contém (x, z)."
  @spec at(t, number, number) :: [term]
  def at(grid, x, z), do: Map.get(grid, {cell(x), cell(z)}, [])

  defp cell(v), do: floor(v / @cell)
end
