defmodule Abyss.World.Reconcile do
  @moduledoc """
  Reconciliação pura na volta de uma fotografia (design do gate P, §6.4). O banco manda
  em quais espécies e ramos existem e quando se extinguiram; a fotografia manda nas
  criaturas.

  - Viva no banco e ausente no `Sim` (criada ou ramificada depois da fotografia): entra
    com 3 fundadoras (ramo: da planta dele).
  - Extinta no banco e ainda não extinta no `Sim`: as criaturas dela saem e ela fica
    extinta no ms do mundo da extinção gravada.
  - Extinta no banco e ausente no `Sim`: entra extinta, sem criaturas.

  As datas do banco chegam em hora real e entram no relógio do mundo (`real − offset_ms`).
  """

  alias Abyss.World.Sim

  @type db :: %{
          required(:live) => [Abyss.World.Species.t()],
          required(:extinct) => [{Abyss.World.Species.t(), integer}],
          optional(:branch_seq) => %{String.t() => pos_integer}
        }

  @spec apply(Sim.t(), db, integer) :: Sim.t()
  def apply(%Sim{} = sim, db, offset_ms) do
    known = sim.bounds.species

    sim =
      Enum.reduce(db.live, sim, fn sp, acc ->
        if Map.has_key?(known, sp.id),
          do: acc,
          else: Sim.add_species(acc, to_world(sp, offset_ms), founders: 3)
      end)

    sim =
      Enum.reduce(db.extinct, sim, fn {sp, real_ms}, acc ->
        world_ms = real_ms - offset_ms

        cond do
          Map.has_key?(acc.extinct, sp.id) ->
            acc

          Map.has_key?(acc.bounds.species, sp.id) ->
            Sim.force_extinct(acc, sp.id, world_ms)

          true ->
            Sim.add_species(acc, to_world(sp, offset_ms), founders: 0, extinct_ms: world_ms)
        end
      end)

    Sim.reserve_branch_seq(sim, Map.get(db, :branch_seq, %{}))
  end

  defp to_world(%{born_ms: ms} = sp, offset) when is_integer(ms), do: %{sp | born_ms: ms - offset}
  defp to_world(sp, _offset), do: sp
end
