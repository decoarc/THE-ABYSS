defmodule Abyss.Genesis.SchemaTest do
  use Abyss.DataCase, async: true

  alias Abyss.Genesis.{Creator, SpeciesRecord}

  defp creator!(email) do
    Repo.insert!(%Creator{email_normalized: email})
  end

  defp species_attrs(creator, code) do
    %SpeciesRecord{
      creator_id: creator.id,
      name: "Nome",
      code: code,
      blueprint: %{"x" => 1},
      ruleset: "s1",
      published_at: DateTime.utc_now()
    }
  end

  test "e-mail normalizado é único em creators" do
    creator!("a@b.com")
    assert {:error, cs} = Repo.insert(Creator.changeset(%Creator{}, %{email_normalized: "a@b.com"}))
    assert {"has already been taken", _} = cs.errors[:email_normalized]
  end

  test "um criador tem no máximo uma espécie" do
    c = creator!("a@b.com")
    Repo.insert!(species_attrs(c, "AAAA"))

    assert {:error, cs} = Repo.insert(SpeciesRecord.changeset(species_attrs(c, "BBBB"), %{}))
    assert {_, opts} = cs.errors[:creator_id]
    assert opts[:constraint] == :unique
  end

  test "code é único" do
    Repo.insert!(species_attrs(creator!("x@y.com"), "AAAA"))

    assert {:error, cs} =
             Repo.insert(SpeciesRecord.changeset(species_attrs(creator!("z@y.com"), "AAAA"), %{}))

    assert {_, opts} = cs.errors[:code]
    assert opts[:constraint] == :unique
  end
end
