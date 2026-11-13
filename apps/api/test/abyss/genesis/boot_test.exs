defmodule Abyss.Genesis.BootTest do
  use Abyss.DataCase, async: false

  alias Abyss.Genesis
  alias Abyss.Genesis.{BranchRecord, Creator, Random, Recorder, SpeciesRecord}
  alias Abyss.World.Server

  setup do
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})
    :ok
  end

  defp insert(i, extinct_ms) do
    {bp, _} = Random.blueprint(:rand.seed_s(:exsss, {i, 7, 7}), Abyss.Genesis.Catalog.get())
    creator = Repo.insert!(%Creator{email_normalized: "b#{i}@seed.invalid"}, log: false)

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
  end

  defp await_founders(world, ids, tries) do
    counts = Server.stats(world).population_by_species |> Map.take(ids) |> Map.values()

    cond do
      counts == [3, 3] ->
        counts

      tries == 0 ->
        counts

      true ->
        Process.sleep(20)
        await_founders(world, ids, tries - 1)
    end
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

    ids = ["sp#{a.id}", "sp#{b.id}"]
    assert await_founders(world, ids, 150) == [3, 3], "fundadoras não nasceram em 3 s"
    assert Server.stats(world).extinct["sp#{c.id}"] == 1_700_000_000_123
  end

  defp insert_branch(root, k_path, extinct_ms, born_ms \\ 1_700_000_000_000) do
    id = "sp#{root.id}.#{k_path}"
    parent = id |> String.split(".") |> Enum.drop(-1) |> Enum.join(".")

    {bp, _} =
      Random.blueprint(:rand.seed_s(:exsss, {root.id + 50, 9, 9}), Abyss.Genesis.Catalog.get())

    Repo.insert!(
      %BranchRecord{
        id: id,
        root_species_id: root.id,
        parent_id: parent,
        name: "Ramo #{id}",
        code: "#{root.code}.#{k_path}",
        blueprint: bp,
        region: "reef",
        born_at: DateTime.from_unix!(born_ms * 1000, :microsecond),
        extinct_at: extinct_ms && DateTime.from_unix!(extinct_ms * 1000, :microsecond)
      },
      log: false
    )
  end

  defp start_world do
    {:ok, world} =
      Server.start_link(
        name: nil,
        population: 5,
        test_species: false,
        tick_hz: 50,
        seed: 1,
        species_loader: &Genesis.boot_species/0
      )

    world
  end

  test "ramo vivo volta com 3 da própria planta" do
    a = insert(1, nil)
    b = insert_branch(a, "1", nil)

    %{live: live} = Genesis.boot_species()
    assert Enum.map(live, & &1.id) == ["sp#{a.id}", b.id]
    br = Enum.at(live, 1)
    assert br.parent == "sp#{a.id}" and br.root == "sp#{a.id}" and br.region == "reef"
    assert br.born_ms == 1_700_000_000_000

    world = start_world()
    assert await_founders(world, ["sp#{a.id}", b.id], 150) == [3, 3]

    sim = :sys.get_state(world).sim
    gids = for o <- sim.organisms, o.species == b.id, do: o.genome
    assert gids != []
    assert Enum.all?(gids, &(sim.genomes[&1].bp == b.blueprint))
  end

  test "mãe extinta não volta, ramo vivo sim" do
    a = insert(1, 1_700_000_000_500)
    b = insert_branch(a, "1", nil)

    %{live: live, extinct: extinct} = Genesis.boot_species()
    assert Enum.map(live, & &1.id) == [b.id]
    assert [{sp, 1_700_000_000_500}] = extinct
    assert sp.id == "sp#{a.id}"
  end

  test "boot traz ancestrais extintos de ramos vivos" do
    a = insert(1, 1_000)
    insert_branch(a, "1", 2_000)
    insert_branch(a, "1.1", 3_000)
    live = insert_branch(a, "1.1.1", nil)
    for i <- 2..105, do: insert(i, 1_700_000_000_000 + i)

    %{live: l, extinct: extinct} = Genesis.boot_species()
    assert live.id in Enum.map(l, & &1.id)
    ids = Enum.map(extinct, fn {sp, _} -> sp.id end)
    assert "sp#{a.id}" in ids
    assert "sp#{a.id}.1" in ids
    assert "sp#{a.id}.1.1" in ids
    assert length(ids) == 103
  end

  test "ordem: pai antes do filho" do
    a = insert(1, nil)
    insert_branch(a, "2", nil, 5_000)
    insert_branch(a, "1.1", nil, 3_000)
    insert_branch(a, "1", nil, 1_000)
    b = insert(2, nil)

    %{live: live} = Genesis.boot_species()
    ids = Enum.map(live, & &1.id)
    assert ids == ["sp#{a.id}", "sp#{b.id}", "sp#{a.id}.1", "sp#{a.id}.1.1", "sp#{a.id}.2"]
  end

  test "id de ramo antigo não carregado não é reaproveitado" do
    a = insert(1, nil)
    insert_branch(a, "5", 1_000)
    for i <- 2..103, do: insert(i, 1_700_000_000_000 + i)

    boot = Genesis.boot_species()
    refute "sp#{a.id}.5" in Enum.map(boot.extinct, fn {sp, _} -> sp.id end)
    assert boot.branch_seq == %{"sp#{a.id}" => 5}

    world = start_world()
    assert :sys.get_state(world).sim.branch_seq["sp#{a.id}"] == 5
  end

  test "nascimento de ramo é gravado uma vez" do
    a = insert(1, nil)
    b = insert_branch(a, "1", nil)
    Repo.delete!(b, log: false)

    br = %{
      Genesis.species_from_record(a)
      | id: b.id,
        code: b.code,
        name: b.name,
        blueprint: b.blueprint,
        parent: "sp#{a.id}",
        root: "sp#{a.id}",
        region: "reef",
        born_ms: 1_700_000_000_000
    }

    Recorder.record_branches([br])
    Recorder.record_branches([br])
    :sys.get_state(Recorder)
    assert Repo.aggregate(BranchRecord, :count, log: false) == 1
    row = Repo.get!(BranchRecord, b.id, log: false)
    assert row.root_species_id == a.id and row.parent_id == "sp#{a.id}"
    assert DateTime.to_unix(row.born_at, :millisecond) == 1_700_000_000_000
    assert row.extinct_at == nil
  end

  test "extinção de ramo é gravada" do
    a = insert(1, nil)
    b = insert_branch(a, "1", nil)
    Recorder.record([{b.id, 1_700_000_000_000}])
    :sys.get_state(Recorder)
    first = Repo.get!(BranchRecord, b.id, log: false).extinct_at
    assert DateTime.to_unix(first, :millisecond) == 1_700_000_000_000

    Recorder.record([{b.id, 1_800_000_000_000}])
    :sys.get_state(Recorder)
    assert Repo.get!(BranchRecord, b.id, log: false).extinct_at == first
  end

  test "reset apaga ramos" do
    a = insert(1, nil)
    insert_branch(a, "1", nil)
    :ok = Genesis.reset!()
    assert Repo.aggregate(BranchRecord, :count, log: false) == 0
    assert Repo.aggregate(SpeciesRecord, :count, log: false) == 0
  end

  test "um registro com planta não processável é pulado, não apaga as outras" do
    a = insert(1, nil)
    b = insert(2, nil)
    bad = insert(3, nil)

    broken =
      put_in(bad.blueprint, ["parts"], [%{"kind" => "inexistente", "at" => 0.5, "around" => 0.0}])

    Repo.update_all(from(s in SpeciesRecord, where: s.id == ^bad.id), [set: [blueprint: broken]],
      log: false
    )

    %{live: live} = Genesis.boot_species()
    assert Enum.map(live, & &1.id) == ["sp#{a.id}", "sp#{b.id}"]
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

  test "abyss.seed_species recusa fora do dev e não insere nada" do
    assert Application.get_env(:abyss, :allow_seed) in [nil, false]

    assert catch_exit(Mix.Tasks.Abyss.SeedSpecies.run(["--count", "1", "--seed", "1"])) ==
             {:shutdown, 1}

    assert Repo.aggregate(SpeciesRecord, :count, log: false) == 0
  end

  test "seed! publica espécies com código" do
    :ok = Genesis.seed!(3, 1)
    recs = Repo.all(from(s in SpeciesRecord, order_by: s.id), log: false)
    assert Enum.map(recs, & &1.name) == ["Semente 1", "Semente 2", "Semente 3"]
    assert Enum.all?(recs, &(&1.code == Genesis.code_for(&1.id)))
    assert length(Genesis.boot_species().live) == 3
  end
end
