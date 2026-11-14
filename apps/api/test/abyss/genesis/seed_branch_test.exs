defmodule Abyss.Genesis.SeedBranchTest do
  use Abyss.DataCase, async: false

  alias Abyss.Genesis
  alias Abyss.Genesis.{Blueprint, BranchRecord, SpeciesRecord}

  setup do
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})
    :ok
  end

  test "seed_branch! grava um ramo válido, 2+ peças além da raiz, com ids seguintes" do
    Genesis.seed!(1, 5)
    root = Repo.one!(SpeciesRecord, log: false)

    b1 = Genesis.seed_branch!(root.id)
    b2 = Genesis.seed_branch!(root.id)

    assert b1.id == "sp#{root.id}.1" and b2.id == "sp#{root.id}.2"
    assert b1.code == "#{root.code}.1"
    assert Repo.aggregate(BranchRecord, :count, log: false) == 2

    cat = Abyss.Genesis.Catalog.get()
    assert {:ok, _} = Blueprint.validate(b1.blueprint, cat, budget: false)
    assert Blueprint.part_distance(Blueprint.part_delta(root.blueprint, b1.blueprint)) >= 2

    assert %{live: live} = Genesis.boot_species()
    assert "sp#{root.id}.1" in Enum.map(live, & &1.id)
  end
end
