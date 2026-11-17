defmodule Abyss.HistoryTest do
  use Abyss.DataCase, async: false

  alias Abyss.History
  alias Abyss.Genesis.{BranchRecord, Catalog, Creator, DeathCount, Random, SpeciesRecord}
  alias Abyss.World.WorldEvent

  setup do
    Ecto.Adapters.SQL.Sandbox.mode(Repo, {:shared, self()})
    :ok
  end

  defp t(s), do: DateTime.from_unix!(s, :second) |> DateTime.add(0, :microsecond)

  defp bp(i) do
    {bp, _} = Random.blueprint(:rand.seed_s(:exsss, {i, 9, 9}), Catalog.get())
    bp
  end

  defp root(i, name, extra \\ []) do
    creator = Repo.insert!(%Creator{email_normalized: "h#{i}@seed.invalid"}, log: false)

    Repo.insert!(
      struct!(
        %SpeciesRecord{
          creator_id: creator.id,
          name: name,
          code: "H#{i}",
          blueprint: bp(i),
          ruleset: "s1",
          published_at: t(1_800_000_000)
        },
        extra
      ),
      log: false
    )
  end

  defp branch(root, k, name, blueprint, extra \\ []) do
    parent = Keyword.get(extra, :parent_id, "sp#{root.id}")

    Repo.insert!(
      struct!(
        %BranchRecord{
          id: "#{parent}.#{k}",
          root_species_id: root.id,
          parent_id: parent,
          name: name,
          code: "H#{root.id}.#{k}#{System.unique_integer([:positive])}",
          blueprint: blueprint,
          region: "floresta",
          born_at: t(1_800_100_000)
        },
        Keyword.delete(extra, :parent_id)
      ),
      log: false
    )
  end

  defp with_parts(bp, kinds) do
    extra =
      for k <- kinds,
          do: %{
            "kind" => k,
            "at" => 0.5,
            "around" => 0.0,
            "size" => 1.0,
            "angle" => 0.0,
            "mirror" => false
          }

    Map.update!(bp, "parts", &(&1 ++ extra))
  end

  describe "busca" do
    test "busca acha raiz e ramo, vivas primeiro" do
      a = root(1, "Lumina", extinct_at: t(1_800_200_000))
      branch(a, 1, "Lumina · Floresta", a.blueprint)
      root(2, "Lumineira")

      assert [
               %{id: "sp" <> _, name: "Lumina · Floresta", alive: true, root: root_id},
               %{name: "Lumineira", alive: true},
               %{name: "Lumina", alive: false}
             ] = History.search("lumin")

      assert root_id == "sp#{a.id}"
    end

    test "busca não deixa de fora uma viva quando há mais de 20 nomes" do
      for i <- 1..21,
          do:
            root(100 + i, "Abismo A#{String.pad_leading("#{i}", 2, "0")}",
              extinct_at: t(1_800_200_000)
            )

      root(200, "Abismo Z")

      names = History.search("abismo") |> Enum.map(& &1.name)
      assert length(names) == 20
      assert hd(names) == "Abismo Z"
    end

    test "busca escapa curingas e ignora acento" do
      root(3, "Lumina")
      root(4, "Garra_50%")

      assert [%{name: "Lumina"}] = History.search("lúmina")
      assert [%{name: "Lumina"}] = History.search("  LUMI ")
      assert History.search("%") == []
      assert History.search("__") == []
      assert [%{name: "Garra_50%"}] = History.search("a_50%")
      assert History.search("") == []
      assert History.search("a") == []
      assert History.search(String.duplicate("x", 500)) == []
      assert [%{name: "Lumina"}] = History.search("Lumina" <> String.duplicate(" ", 100))
    end
  end

  describe "árvore" do
    test "árvore com diferenças de peças" do
      r = root(5, "Raiz")
      b = branch(r, 1, "Raiz · Floresta", with_parts(r.blueprint, ["ocelo", "ocelo"]))

      branch(r, 1, "Raiz · Floresta · Vale", with_parts(b.blueprint, ["flagelo"]),
        parent_id: b.id
      )

      assert {:ok, %{root: node, restarts: []}} = History.tree("sp#{r.id}")
      assert node.id == "sp#{r.id}" and node.diff == %{} and node.extinct == nil
      assert node.born_at == "2027-01-15T08:00:00.000000Z"
      [child] = node.children
      assert child.diff == %{"ocelo" => 2} and child.region == "floresta"
      [grand] = child.children
      assert grand.diff == %{"flagelo" => 1} and grand.name == "Raiz · Floresta · Vale"
    end

    test "reta final por predador" do
      prey = root(6, "Presa")
      hunter = root(7, "Garra")
      w = 10_000_000

      Repo.update_all(
        from(s in SpeciesRecord, where: s.id == ^prey.id),
        set: [
          extinct_at: t(1_800_300_000),
          extinct_cause: "predation",
          extinct_predator_id: "sp#{hunter.id}",
          extinct_world_ms: w,
          extinct_epoch: 2
        ]
      )

      id = "sp#{prey.id}"

      rows = [
        %{
          species_id: id,
          epoch: 2,
          bucket_ms: 9_900_000,
          cause: "predation",
          predator_id: "sp#{hunter.id}",
          n: 3,
          tick: 1
        },
        %{
          species_id: id,
          epoch: 2,
          bucket_ms: 9_600_000,
          cause: "predation",
          predator_id: "sp#{hunter.id}",
          n: 2,
          tick: 1
        },
        %{
          species_id: id,
          epoch: 2,
          bucket_ms: 9_000_000,
          cause: "predation",
          predator_id: "filamento",
          n: 2,
          tick: 1
        },
        %{
          species_id: id,
          epoch: 2,
          bucket_ms: 8_400_000,
          cause: "starvation",
          predator_id: nil,
          n: 3,
          tick: 1
        },
        # Fora da reta final: antes dos 30 min e de outro epoch.
        %{
          species_id: id,
          epoch: 2,
          bucket_ms: 7_500_000,
          cause: "old_age",
          predator_id: nil,
          n: 50,
          tick: 1
        },
        %{
          species_id: id,
          epoch: 1,
          bucket_ms: 9_900_000,
          cause: "old_age",
          predator_id: nil,
          n: 50,
          tick: 1
        }
      ]

      Repo.insert_all(DeathCount, rows, log: false)

      {:ok, %{root: node}} = History.tree(id)
      ex = node.extinct
      assert ex.cause == "predation"
      assert ex.predator == %{id: "sp#{hunter.id}", name: "Garra"}
      assert ex.at == "2027-01-18T19:20:00.000000Z"

      assert ex.final == [
               %{cause: "predation", predator_name: "Garra", share: 0.5},
               %{cause: "starvation", predator_name: nil, share: 0.3},
               %{cause: "predation", predator_name: "Filamento", share: 0.2}
             ]
    end

    test "nome do predador de teste e de ramo" do
      r = root(8, "Mãe")
      b = branch(r, 1, "Mãe · Recife", r.blueprint)
      prey = root(9, "Alvo")

      set = fn pred ->
        Repo.update_all(from(s in SpeciesRecord, where: s.id == ^prey.id),
          set: [
            extinct_at: t(1_800_300_000),
            extinct_cause: "predation",
            extinct_predator_id: pred
          ]
        )

        {:ok, %{root: node}} = History.tree("sp#{prey.id}")
        node.extinct.predator
      end

      assert set.(b.id) == %{id: b.id, name: "Mãe · Recife"}
      assert set.("celula") == %{id: "celula", name: "Célula"}
      assert set.("sp999999") == %{id: "sp999999", name: "predador desconhecido"}
    end

    test "extinção antiga sem causa" do
      r = root(10, "Antiga", extinct_at: t(1_800_300_000))
      {:ok, %{root: node}} = History.tree("sp#{r.id}")

      assert node.extinct == %{
               at: "2027-01-18T19:20:00.000000Z",
               cause: nil,
               predator: nil,
               final: []
             }
    end

    test "ramo extinto por divisão não tem reta final" do
      r = root(11, "Divide")

      branch(r, 1, "Divide · Vale", r.blueprint,
        extinct_at: t(1_800_300_000),
        extinct_cause: "branched"
      )

      {:ok, %{root: node}} = History.tree("sp#{r.id}")
      [child] = node.children
      assert child.extinct.cause == "branched" and child.extinct.final == []
    end

    test "recomeço aparece na raiz viva" do
      r = root(12, "Viva")
      gone = root(13, "Morta", extinct_at: t(1_800_050_000))

      for {at, kind} <- [
            {1_799_000_000, "restart"},
            {1_800_100_000, "restart"},
            {1_800_150_000, "pause"}
          ] do
        Repo.insert!(%WorldEvent{kind: kind, epoch: 2, at: t(at), meta: %{}}, log: false)
      end

      assert {:ok, %{restarts: ["2027-01-16T11:46:40.000000Z"]}} = History.tree("sp#{r.id}")
      assert {:ok, %{restarts: []}} = History.tree("sp#{gone.id}")
    end

    test "id desconhecido" do
      assert History.tree("sp999999") == :not_found
      assert History.tree("lixo") == :not_found
      assert History.tree("sp1.1") == :not_found
    end
  end
end
