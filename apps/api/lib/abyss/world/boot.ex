defmodule Abyss.World.Boot do
  @moduledoc """
  Volta do mundo no boot (design do gate P, §6.4). Tenta as 3 fotografias mais novas, da
  mais nova para a mais velha, e usa a primeira com checksum válido e versões compatíveis.

  - `{:restored, …}`: o relógio do mundo continua exatamente do ponto salvo
    (`offset_ms = agora real − world_ms da fotografia`); grava o evento `"pause"` (de
    `saved_at` até agora) e descarta as contagens de mortes do mesmo `epoch` com tick
    depois da fotografia (o mundo refeito as contaria de novo), menos as de espécies cuja
    extinção foi gravada depois de `saved_at` (a reta final delas é verdadeira).
  - `{:fresh, …}`: sem fotografia, `epoch` 1 e nenhum evento; com fotografia inutilizável,
    `epoch` = maior + 1 e o evento `"restart"` com o motivo da mais nova.
  """

  import Ecto.Query

  alias Abyss.Genesis.{BranchRecord, DeathCount, SpeciesRecord}
  alias Abyss.Repo
  alias Abyss.World.{Saver, Snapshot, SnapshotRecord, WorldEvent}

  require Logger

  @type reason :: :none | :rules | :format | :map | :checksum

  @spec load(Snapshot.ctx()) ::
          {:restored,
           %{
             sim: Abyss.World.Sim.t(),
             offset_ms: integer,
             epoch: pos_integer,
             snapshot_tick: non_neg_integer,
             saved_at_ms: integer
           }}
          | {:fresh, %{epoch: pos_integer, reason: reason}}
  def load(ctx) do
    case Saver.latest(3) do
      [] -> {:fresh, %{epoch: 1, reason: :none}}
      records -> first_valid(records, ctx, nil)
    end
  end

  defp first_valid([], _ctx, reason), do: restart(reason)

  defp first_valid([rec | rest], ctx, reason) do
    with :ok <- check(rec),
         {:ok, sim} <- Snapshot.decode(rec.data, ctx) do
      restored(rec, sim)
    else
      {:error, why} ->
        Logger.error("fotografia do tick #{rec.tick} (epoch #{rec.epoch}) recusada: #{why}")
        first_valid(rest, ctx, reason || why)
    end
  end

  defp check(%SnapshotRecord{data: data, checksum: sum}) do
    if Snapshot.checksum(data) == sum, do: :ok, else: {:error, :checksum}
  end

  defp restored(rec, sim) do
    now = System.system_time(:millisecond)
    saved_at_ms = DateTime.to_unix(rec.saved_at, :millisecond)

    Repo.insert!(
      %WorldEvent{
        kind: "pause",
        epoch: rec.epoch,
        at: rec.saved_at,
        until: DateTime.from_unix!(now * 1000, :microsecond),
        meta: %{"tick" => rec.tick}
      },
      log: false
    )

    discard_counts(rec)

    {:restored,
     %{
       sim: sim,
       offset_ms: now - rec.world_ms,
       epoch: rec.epoch,
       snapshot_tick: rec.tick,
       saved_at_ms: saved_at_ms
     }}
  end

  defp discard_counts(rec) do
    roots =
      from(s in SpeciesRecord,
        where: s.extinct_at > ^rec.saved_at,
        select: fragment("'sp' || ?::text", s.id)
      )
      |> Repo.all(log: false)

    branches =
      from(b in BranchRecord, where: b.extinct_at > ^rec.saved_at, select: b.id)
      |> Repo.all(log: false)

    keep = roots ++ branches

    from(d in DeathCount,
      where: d.epoch == ^rec.epoch and d.tick > ^rec.tick and d.species_id not in ^keep
    )
    |> Repo.delete_all(log: false)
  end

  defp restart(reason) do
    epoch = (Repo.aggregate(SnapshotRecord, :max, :epoch, log: false) || 0) + 1

    Repo.insert!(
      %WorldEvent{
        kind: "restart",
        epoch: epoch,
        at: DateTime.utc_now(),
        meta: %{"reason" => Atom.to_string(reason)}
      },
      log: false
    )

    Logger.warning("mundo recomeçado (epoch #{epoch}, motivo #{reason})")
    {:fresh, %{epoch: epoch, reason: reason}}
  end
end
