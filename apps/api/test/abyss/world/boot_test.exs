defmodule Abyss.World.BootTest do
  use Abyss.DataCase, async: false

  import Ecto.Query

  alias Abyss.Genesis.{Catalog, Creator, DeathCount, SpeciesRecord}
  alias Abyss.World.{Boot, Saver, Sim, Snapshot, SnapshotRecord, WorldEvent}
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @food Application.compile_env!(:abyss, :food) |> Map.new()
  @ctx %{map: @map, catalog: Catalog.get(), mutation_boost: 1.0}
  @hour 3_600_000

  setup do
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})
    :ok
  end

  defp now, do: System.system_time(:millisecond)

  defp sim(now_ms, steps) do
    s =
      Sim.new(%{
        population: 45,
        seed: 4,
        now_ms: now_ms,
        map: @map,
        creature_scale: 0.5,
        test_species: true,
        food: @food,
        catalog: Catalog.get()
      })

    Enum.reduce(1..steps, s, fn _, s -> Sim.step(s, 0.1) end)
  end

  defp save(sim, epoch, saved_at_ms) do
    Saver.write(%{
      sim: sim,
      epoch: epoch,
      world_ms: sim.now_ms,
      saved_at: DateTime.from_unix!(saved_at_ms * 1000, :microsecond)
    })
  end

  defp newest, do: hd(Saver.latest(1))

  test "sem fotografia: epoch 1, sem evento" do
    assert Boot.load(@ctx) == {:fresh, %{epoch: 1, reason: :none}}
    assert Repo.aggregate(WorldEvent, :count, log: false) == 0
  end

  test "volta da fotografia mais nova" do
    a = sim(now() - 60_000, 3)
    b = sim(now() - 60_000, 8)
    saved_b = now() - 10_000
    save(a, 1, now() - 30_000)
    save(b, 1, saved_b)

    assert {:restored, r} = Boot.load(@ctx)
    assert r.snapshot_tick == b.tick and r.sim.tick == b.tick and r.epoch == 1
    assert r.sim.organisms == b.organisms
    assert_in_delta r.offset_ms, now() - b.now_ms, 1_000

    [ev] = Repo.all(WorldEvent, log: false)
    assert ev.kind == "pause" and ev.epoch == 1 and ev.until != nil
    assert DateTime.to_unix(ev.at, :millisecond) == saved_b
  end

  test "checksum ruim cai para a anterior" do
    a = sim(now(), 3)
    save(a, 1, now() - 20_000)
    save(sim(now(), 8), 1, now() - 10_000)
    rec = newest()

    Repo.update_all(from(s in SnapshotRecord, where: s.id == ^rec.id),
      set: [data: binary_part(rec.data, 0, div(byte_size(rec.data), 2))]
    )

    assert {:restored, r} = Boot.load(@ctx)
    assert r.snapshot_tick == a.tick
  end

  test "regras diferentes recomeçam com epoch novo e evento" do
    s = sim(now(), 3)
    save(s, 4, now() - 5_000)
    rec = newest()

    bad =
      rec.data
      |> :erlang.binary_to_term()
      |> Map.update!(:rules_version, &(&1 + 1))
      |> :erlang.term_to_binary([:compressed])

    Repo.update_all(from(x in SnapshotRecord, where: x.id == ^rec.id),
      set: [data: bad, checksum: Snapshot.checksum(bad)]
    )

    assert Boot.load(@ctx) == {:fresh, %{epoch: 5, reason: :rules}}
    [ev] = Repo.all(WorldEvent, log: false)
    assert ev.kind == "restart" and ev.epoch == 5 and ev.meta["reason"] == "rules"
  end

  test "volta depois de 6 h não mata por velhice" do
    base = sim(now() - 6 * @hour, 30)
    save(base, 1, now() - 6 * @hour)

    assert {:restored, r} = Boot.load(@ctx)
    assert_in_delta r.offset_ms, now() - base.now_ms, 1_000
    assert r.offset_ms > 6 * @hour - 10_000

    restored = Sim.step(r.sim, 0.1, now() - r.offset_ms)
    normal = Sim.step(base, 0.1)

    old_age = fn s -> Enum.count(s.life_events.dead_by, &match?({_, :old_age, _}, &1)) end
    assert old_age.(restored) <= old_age.(normal)
    assert restored.now_ms - base.now_ms < 2_000

    expired = fn s -> s.totals.particles_expired - base.totals.particles_expired end
    assert expired.(restored) <= expired.(normal) + 2
    assert length(restored.organisms) >= length(normal.organisms) - 1
  end

  test "queda descarta contagens depois da fotografia, menos as de extinção" do
    creator = Repo.insert!(%Creator{email_normalized: "bt@seed.invalid"}, log: false)

    {:ok, bp} =
      Abyss.Genesis.Blueprint.validate(
        elem(Abyss.Genesis.Random.blueprint(:rand.seed_s(:exsss, 1), Catalog.get()), 0),
        Catalog.get()
      )

    gone =
      Repo.insert!(
        %SpeciesRecord{
          creator_id: creator.id,
          name: "Gone",
          code: "GN",
          blueprint: bp,
          ruleset: "s1",
          published_at: DateTime.utc_now(),
          extinct_at: DateTime.utc_now()
        },
        log: false
      )

    s = sim(now(), 3)
    save(s, 2, now() - 5_000)
    gone_id = "sp#{gone.id}"

    rows = [
      %{species_id: "spX", epoch: 2, bucket_ms: 0, cause: "starvation", n: 1, tick: s.tick},
      %{species_id: "spX", epoch: 2, bucket_ms: 0, cause: "starvation", n: 4, tick: s.tick + 5},
      %{species_id: gone_id, epoch: 2, bucket_ms: 0, cause: "predation", n: 2, tick: s.tick + 5},
      %{species_id: "spX", epoch: 1, bucket_ms: 0, cause: "old_age", n: 3, tick: s.tick + 5}
    ]

    Repo.insert_all(DeathCount, rows, log: false)
    assert {:restored, _} = Boot.load(@ctx)

    left =
      Repo.all(
        from(d in DeathCount,
          order_by: [asc: d.epoch, asc: d.species_id, asc: d.n],
          select: {d.species_id, d.epoch, d.n}
        ),
        log: false
      )

    assert left ==
             [{"spX", 1, 3}, {gone_id, 2, 2}, {"spX", 2, 1}]
             |> Enum.sort_by(&{elem(&1, 1), elem(&1, 0), elem(&1, 2)})
  end
end
