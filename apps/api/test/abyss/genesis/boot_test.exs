defmodule Abyss.Genesis.BootTest do
  use Abyss.DataCase, async: false

  alias Abyss.Genesis
  alias Abyss.Genesis.{Creator, Random, Recorder, SpeciesRecord}
  alias Abyss.World.Server

  setup do
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})
    :ok
  end

  defp insert(i, extinct_ms) do
    {bp, _} = Random.blueprint(:rand.seed_s(:exsss, {i, 7, 7}), Abyss.Genesis.Catalog.get())
    creator = Repo.insert!(%Creator{email_normalized: "b#{i}@seed.invalid"}, log: false)

    record =
      Repo.insert!(
        %SpeciesRecord{
          creator_id: creator.id,
          name: "Boot #{i}",
          code: "T#{i}",
          blueprint: bp,
          ruleset: "s1",
          published_at: DateTime.utc_now(),
          extinct_at: extinct_ms && DateTime.from_unix!(extinct_ms * 1000, :microsecond)
        },
        log: false
      )

    record
  end

  test "vivas voltam e extintas continuam extintas, com data" do
    a = insert(1, nil)
    b = insert(2, nil)
    c = insert(3, 1_700_000_000_123)

    %{live: live, extinct: extinct} = Genesis.boot_species()
    assert Enum.map(live, & &1.id) == ["sp#{a.id}", "sp#{b.id}"]
    assert [{sp, 1_700_000_000_123}] = extinct
    assert sp.id == "sp#{c.id}"

    {:ok, world} =
      Server.start_link(
        name: nil,
        population: 5,
        test_species: false,
        tick_hz: 50,
        seed: 1,
        species_loader: &Genesis.boot_species/0
      )

    Process.sleep(200)

    assert Server.stats(world).population_by_species
           |> Map.take(["sp#{a.id}", "sp#{b.id}"])
           |> Map.values() == [3, 3]

    assert Server.stats(world).extinct["sp#{c.id}"] == 1_700_000_000_123
  end

  test "só 100 extintas no boot" do
    for i <- 1..102, do: insert(i, 1_700_000_000_000 + i)
    assert length(Genesis.boot_species().extinct) == 100
  end

  test "extinção é gravada" do
    r = insert(1, nil)
    id = "sp#{r.id}"
    Recorder.record([{id, 1_700_000_000_000}, {"lixo", 5}])
    :sys.get_state(Recorder)
    first = Repo.get!(SpeciesRecord, r.id, log: false).extinct_at
    assert DateTime.to_unix(first, :millisecond) == 1_700_000_000_000

    Recorder.record([{id, 1_800_000_000_000}])
    :sys.get_state(Recorder)
    assert Repo.get!(SpeciesRecord, r.id, log: false).extinct_at == first
  end

  test "seed! publica espécies com código" do
    :ok = Genesis.seed!(3, 1)
    recs = Repo.all(from(s in SpeciesRecord, order_by: s.id), log: false)
    assert Enum.map(recs, & &1.name) == ["Semente 1", "Semente 2", "Semente 3"]
    assert Enum.all?(recs, &(&1.code == Genesis.code_for(&1.id)))
    assert length(Genesis.boot_species().live) == 3
  end
end
