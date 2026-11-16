defmodule Abyss.Genesis.RecorderTest do
  use Abyss.DataCase, async: false

  import Ecto.Query

  alias Abyss.Genesis
  alias Abyss.Genesis.{Creator, DeathCount, Random, Recorder, SpeciesRecord}

  setup do
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})
    :ok
  end

  defp insert_species(i) do
    {bp, _} = Random.blueprint(:rand.seed_s(:exsss, {i, 3, 3}), Abyss.Genesis.Catalog.get())
    creator = Repo.insert!(%Creator{email_normalized: "r#{i}@seed.invalid"}, log: false)

    Repo.insert!(
      %SpeciesRecord{
        creator_id: creator.id,
        name: "Rec #{i}",
        code: "R#{i}",
        blueprint: bp,
        ruleset: "s1",
        published_at: DateTime.utc_now()
      },
      log: false
    )
  end

  defp rows(species_id) do
    Repo.all(
      from(d in DeathCount,
        where: d.species_id == ^species_id,
        order_by: [asc: d.bucket_ms, asc: d.cause, asc: d.predator_id],
        select: {d.epoch, d.bucket_ms, d.cause, d.predator_id, d.n, d.tick}
      ),
      log: false
    )
  end

  test "mortes somam por intervalo de 5 min" do
    Recorder.record_deaths([{"sp1", :starvation, nil}], 0, 10, 1)
    Recorder.record_deaths([{"sp1", :starvation, nil}, {"sp1", :starvation, nil}], 299_999, 11, 1)
    Recorder.record_deaths([{"sp1", :starvation, nil}], 300_000, 12, 1)
    Recorder.sync()

    assert rows("sp1") == [
             {1, 0, "starvation", nil, 3, 11},
             {1, 300_000, "starvation", nil, 1, 12}
           ]
  end

  test "predador fica na linha" do
    Recorder.record_deaths(
      [{"sp4", :predation, "sp2"}, {"sp4", :predation, :filamento}, {"sp4", :predation, "sp2"}],
      1_000,
      7,
      2
    )

    Recorder.flush_deaths()
    Recorder.sync()

    assert rows("sp4") == [
             {2, 0, "predation", "filamento", 1, 7},
             {2, 0, "predation", "sp2", 2, 7}
           ]
  end

  test "extinção grava causa e reta final antes" do
    r = insert_species(1)
    id = "sp#{r.id}"
    Recorder.record_deaths([{id, :predation, "sp2"}], 600_000, 40, 3)
    at = 1_800_000_000_000

    Recorder.record([
      %{id: id, at_ms: at, world_ms: 600_100, epoch: 3, cause: :predation, predator: "sp2"}
    ])

    # Sem `sync`: o flush da reta final acontece dentro do próprio `record`.
    :sys.get_state(Recorder)

    s = Repo.get!(SpeciesRecord, r.id, log: false)
    assert s.extinct_cause == "predation"
    assert s.extinct_predator_id == "sp2"
    assert s.extinct_world_ms == 600_100
    assert s.extinct_epoch == 3
    assert DateTime.to_unix(s.extinct_at, :millisecond) == at
    assert rows(id) == [{3, 600_000, "predation", "sp2", 1, 40}]
  end

  test "ramo extinto por divisão grava branched" do
    r = insert_species(2)

    Repo.insert!(
      %Abyss.Genesis.BranchRecord{
        id: "sp#{r.id}.1",
        root_species_id: r.id,
        parent_id: "sp#{r.id}",
        name: "Rec 2 · Floresta",
        code: "R2.1",
        blueprint: r.blueprint,
        born_at: DateTime.utc_now()
      },
      log: false
    )

    Recorder.record([
      %{id: "sp#{r.id}.1", at_ms: 1_800_000_000_000, world_ms: 5, epoch: 1, cause: :branched}
    ])

    Recorder.sync()
    b = Repo.get!(Abyss.Genesis.BranchRecord, "sp#{r.id}.1", log: false)
    assert b.extinct_cause == "branched" and b.extinct_predator_id == nil
    assert b.extinct_world_ms == 5 and b.extinct_epoch == 1
  end

  test "reset apaga death_counts" do
    Recorder.record_deaths([{"sp9", :old_age, nil}], 0, 1, 1)
    Recorder.sync()
    assert rows("sp9") != []
    Genesis.reset!()
    assert Repo.aggregate(DeathCount, :count, log: false) == 0
  end
end
