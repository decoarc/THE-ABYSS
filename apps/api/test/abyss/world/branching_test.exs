defmodule Abyss.World.BranchingTest do
  use ExUnit.Case, async: true

  alias Abyss.Genesis.{Blueprint, Catalog, Traits}
  alias Abyss.World.{Branching, Flora, Organism, Sim}
  alias Abyss.World.Map, as: WMap

  @map WMap.load!("/shared/world/map-e1.json")
  @food Application.compile_env!(:abyss, :food) |> Map.new()
  @forest {-48.0, 7.0, -30.0}
  @garden {0.0, 7.0, 0.0}

  # Sem mutação no passo: os genomas são só os montados à mão.
  defp cat do
    cat = Catalog.get()
    %{cat | mutation: Map.merge(cat.mutation, %{part_p: 0.0, drift_p: 0.0})}
  end

  defp bp(kinds) do
    parts =
      kinds
      |> Enum.with_index()
      |> Enum.map(fn {kind, i} ->
        %{
          "kind" => kind,
          "at" => 0.1 + 0.1 * i,
          "around" => 1.57,
          "size" => 1.0,
          "angle" => 0.0,
          "mirror" => false
        }
      end)

    raw = %{
      "v" => 1,
      "body" => %{"spine" => [[-0.3, 0.0, 0.5], [0.0, 0.0, 0.5], [0.3, 0.0, 0.5]]},
      "parts" => parts,
      "colors" => %{"glow" => "#7fe9dd", "body" => "#3f5a4a"},
      "pattern" => "liso"
    }

    {:ok, bp} = Blueprint.validate(raw, Catalog.get())
    bp
  end

  defp ref, do: bp(["raspador"])
  defp ocelo2, do: bp(["raspador", "ocelo", "ocelo"])
  defp placa2, do: bp(["raspador", "placa", "placa"])

  defp root_sp(bp) do
    Traits.species(bp, Catalog.get(), %{id: "sp1", code: "S01", name: "Raiz"})
    |> Map.merge(%{parent: nil, root: "sp1", region: nil, born_ms: 0})
  end

  # Mundo vazio com `sp1` (planta `ref`) e os genomas `bps` (gid 1, 2, …).
  defp world(bps) do
    sim =
      Sim.new(%{
        population: 45,
        seed: 7,
        now_ms: 0,
        map: @map,
        creature_scale: 0.5,
        test_species: false,
        food: %{@food | particle_rate: 0.0},
        catalog: cat()
      })

    root = root_sp(ref())
    sim = %{sim | flora: Flora.put_patches(sim.flora, {})} |> Sim.add_species(root, founders: 0)

    genomes =
      bps
      |> Enum.with_index(1)
      |> Map.new(fn {bp, gid} ->
        {gid,
         %{bp: bp, traits: Traits.species(bp, Catalog.get(), Map.take(root, [:id, :code, :name]))}}
      end)

    %{
      sim
      | genomes: genomes,
        genome_index: Map.new(genomes, fn {gid, %{bp: bp}} -> {bp, gid} end),
        next_genome: length(bps) + 1
    }
  end

  defp pad(i), do: i |> Integer.to_string() |> String.pad_leading(4, "0")

  # `n` organismos de `species` com o genoma `gid` perto de `center`; os `unmutated`
  # primeiros nasceram sem mutação de peça. Ids "S01-<from>", "S01-<from + 1>", …
  defp group(from, n, gid, center, unmutated, species \\ "sp1") do
    {x, y, z} = center

    for i <- 0..(n - 1)//1 do
      %Organism{
        id: "S01-#{pad(from + i)}",
        species: species,
        genome: gid,
        mutated: i >= unmutated,
        born_ms: 0,
        pos: {x + rem(i, 4) * 1.5, y, z + div(i, 4) * 1.5},
        energy: 90.0
      }
    end
  end

  # Um passo com a varredura vencida.
  defp scan(sim), do: Sim.step(%{sim | next_scan_ms: sim.now_ms}, 0.1)

  defp ids(orgs), do: Enum.map(orgs, & &1.id)

  test "ramo nasce exatamente no limiar" do
    base = world([ref(), ocelo2()])

    # 4 com +2 ocelo (3 sem mutação) e 2 na planta de referência: nada.
    four = group(1, 4, 2, @forest, 3)
    keep = group(100, 2, 1, @garden, 2)
    s = scan(%{base | organisms: four ++ keep})
    assert s.life_events.branches == [] and s.life_events.rebranch == []
    assert Enum.all?(s.organisms, &(&1.species == "sp1"))

    # O 5º (mutado): ramo.
    five = group(1, 5, 2, @forest, 3)
    s = scan(%{base | organisms: five ++ keep})
    assert [br] = s.life_events.branches
    assert %{id: "sp1.1", code: "S01.1", parent: "sp1", root: "sp1"} = br
    assert br.region == "floresta" and br.name == "Raiz · Floresta"
    assert br.born_ms == s.now_ms
    assert br.blueprint == ocelo2()
    assert br in s.life_events.species
    assert Map.has_key?(s.bounds.species, "sp1.1")
    assert s.life_events.rebranch == for(o <- five, do: {o.id, "sp1.1"})

    moved = Enum.filter(s.organisms, &(&1.id in ids(five)))
    assert length(moved) == 5 and Enum.all?(moved, &(&1.species == "sp1.1"))
    assert Enum.all?(s.organisms -- moved, &(&1.species == "sp1"))
    assert Sim.traits_of(s, hd(moved)).code == "S01.1"
    assert Sim.eco_stats(s).branches_total == 1
  end

  test "distância 1 não forma ramo" do
    base = world([ref(), bp(["raspador", "ocelo"])])
    s = scan(%{base | organisms: group(1, 8, 2, @forest, 8)})
    assert s.life_events.branches == []
    assert Enum.all?(s.organisms, &(&1.species == "sp1"))
  end

  test "jeitos diferentes não se juntam" do
    base = world([ref(), ocelo2(), placa2()])
    orgs = group(1, 3, 2, @forest, 3) ++ group(10, 3, 3, @forest, 3)
    s = scan(%{base | organisms: orgs})
    assert s.life_events.branches == []
  end

  test "tem que ter passado de pais para filhos" do
    base = world([ref(), ocelo2()])
    s = scan(%{base | organisms: group(1, 5, 2, @forest, 2)})
    assert s.life_events.branches == []

    s = scan(%{base | organisms: group(1, 5, 2, @forest, 3)})
    assert [%{id: "sp1.1"}] = s.life_events.branches
  end

  test "nome pela região e repetidos numerados" do
    base = world([ref(), ocelo2(), placa2()])
    orgs = group(1, 6, 2, @forest, 6) ++ group(10, 5, 3, @forest, 5)
    s1 = scan(%{base | organisms: orgs})
    assert [%{id: "sp1.1", name: "Raiz · Floresta"}] = s1.life_events.branches

    s2 = scan(s1)
    assert [%{id: "sp1.2", name: "Raiz · Floresta 2", parent: "sp1"}] = s2.life_events.branches

    # No Jardim, o nome é outro.
    s3 = scan(%{base | organisms: group(1, 5, 2, @garden, 5)})
    assert [%{name: "Raiz · Jardim", region: "jardim"}] = s3.life_events.branches
  end

  test "ramo de ramo" do
    deep = bp(["raspador", "ocelo", "ocelo", "placa", "placa"])
    base = world([ref(), ocelo2(), deep])
    s1 = scan(%{base | organisms: group(1, 5, 2, @forest, 5)})
    assert [%{id: "sp1.1"} = b1] = s1.life_events.branches

    # Membros de sp1.1 divergindo da planta dela (+2 placa). O genoma 3 ficou sem vivos e
    # foi coletado na 1ª varredura: volta junto com eles.
    orgs = group(1, 5, 2, @forest, 5, "sp1.1") ++ group(10, 5, 3, @forest, 5, "sp1.1")
    assert Sim.genome(s1, 3) == nil

    s2 =
      scan(%{
        s1
        | organisms: orgs,
          genomes: Map.put(s1.genomes, 3, base.genomes[3]),
          genome_index: Map.put(s1.genome_index, deep, 3)
      })

    assert [b2] = s2.life_events.branches
    assert %{id: "sp1.1.1", code: "S01.1.1", parent: "sp1.1", root: "sp1"} = b2
    assert b2.name == "Raiz · Floresta 2"
    assert b2.blueprint == deep
    assert b1.blueprint == ocelo2()

    moved = for {id, "sp1.1.1"} <- s2.life_events.rebranch, do: id
    assert moved == ids(group(10, 5, 3, @forest, 5))
  end

  test "um ramo por espécie por varredura" do
    base = world([ref(), ocelo2(), placa2()])

    orgs =
      group(1, 5, 2, @forest, 5) ++ group(10, 6, 3, @garden, 6) ++ group(30, 1, 1, @garden, 1)

    s1 = scan(%{base | organisms: orgs})
    assert [%{id: "sp1.1", blueprint: b1}] = s1.life_events.branches
    assert b1 == placa2()

    # Fora da varredura, nada.
    assert Sim.step(s1, 0.1).life_events.branches == []

    s2 = scan(s1)
    assert [%{id: "sp1.2", blueprint: b2}] = s2.life_events.branches
    assert b2 == ocelo2()
  end

  test "empate de tamanho: menor delta pela ordem de termos" do
    base = world([ref(), ocelo2(), placa2()])
    orgs = group(1, 5, 3, @forest, 5) ++ group(10, 5, 2, @forest, 5)
    s = scan(%{base | organisms: orgs})
    # %{"ocelo" => 2} < %{"placa" => 2}
    assert [%{blueprint: b}] = s.life_events.branches
    assert b == ocelo2()
  end

  test "planta do ramo é a do genoma mais frequente; espécies de teste e sem catálogo não ramificam" do
    # Mesma lista de peças, padrão diferente: mesmo delta, plantas diferentes.
    alt = %{ocelo2() | "pattern" => "manchas"}
    base = world([ref(), alt, ocelo2()])
    orgs = group(1, 2, 2, @forest, 2) ++ group(10, 3, 3, @forest, 3)
    s = scan(%{base | organisms: orgs})
    assert [%{blueprint: b}] = s.life_events.branches
    assert b == ocelo2()

    # Empate de frequência: o menor gid.
    orgs = group(1, 3, 2, @forest, 3) ++ group(10, 3, 3, @forest, 3)
    s = scan(%{base | organisms: orgs})
    assert [%{blueprint: ^alt}] = s.life_events.branches

    # Sem catálogo, a varredura não faz nada.
    plain = %{base | catalog: nil, organisms: group(1, 5, 2, @forest, 5)}
    assert {^plain, [], []} = Branching.scan(plain)
  end
end
