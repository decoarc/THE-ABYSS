defmodule Abyss.World.Branching do
  @moduledoc """
  Ramos (subespécies), gate S2. Varredura pura chamada pelo `Sim` a cada
  `branch_scan_s` do relógio do mundo: em cada espécie viva com planta, os
  vivos com genoma são agrupados pela diferença de peças (`Blueprint.part_delta`)
  entre a planta da espécie e a do genoma. Um grupo com distância >=
  `branch_diff`, pelo menos `branch_min` membros e pelo menos `branch_inherited`
  nascidos sem mutação (a diferença passou de pais para filhos) vira ramo: uma
  espécie nova (`"<mãe>.<k>"`) e os membros passam para ela. No máximo um ramo
  novo por espécie por varredura; o maior grupo, empate pelo menor delta na
  ordem de termos do Erlang.
  """

  alias Abyss.Genesis.{Blueprint, Traits}
  alias Abyss.World.Map, as: WMap
  alias Abyss.World.{Organism, Sim, Species}

  @region_names %{"jardim" => "Jardim", "floresta" => "Floresta", "planicie" => "Planície"}

  @doc """
  Varre `sim.organisms` e registra os ramos que nascem (`Sim.add_species` sem
  fundadoras; ramo e mãe marcados em `populated`, para a extinção). Devolve o `sim`, os
  ramos (na ordem de `species_list`) e as trocas `{id do organismo, id do ramo}`
  (na ordem da lista de organismos). Sem catálogo, não faz nada.
  """
  @spec scan(Sim.t()) :: {Sim.t(), [Species.t()], [{String.t(), String.t()}]}
  def scan(%Sim{catalog: nil} = sim), do: {sim, [], []}

  def scan(%Sim{} = sim) do
    eco = sim.ecology

    rule = %{
      diff: Map.get(eco, :branch_diff, 2),
      min: Map.get(eco, :branch_min, 5),
      inherited: Map.get(eco, :branch_inherited, 3)
    }

    by_species =
      sim.organisms
      |> Enum.filter(&(&1.genome != nil))
      |> Enum.group_by(& &1.species)

    candidates =
      for sp <- sim.bounds.species_list,
          Map.get(sp, :blueprint) != nil,
          not Map.has_key?(sim.extinct, sp.id),
          members = Map.get(by_species, sp.id, []),
          length(members) >= rule.min,
          do: {sp, members}

    {sim, branches, moved} =
      Enum.reduce(candidates, {sim, [], %{}}, fn {sp, members}, {sim, branches, moved} ->
        case pick(sp, members, sim, rule) do
          nil ->
            {sim, branches, moved}

          group ->
            {sim, branch} = register(sim, sp, group)
            moved = Enum.reduce(group, moved, &Map.put(&2, &1.id, branch.id))
            {sim, [branch | branches], moved}
        end
      end)

    if moved == %{} do
      {sim, [], []}
    else
      {orgs, rebranch} =
        Enum.map_reduce(sim.organisms, [], fn %Organism{} = o, acc ->
          case Map.fetch(moved, o.id) do
            {:ok, id} -> {%Organism{o | species: id}, [{o.id, id} | acc]}
            :error -> {o, acc}
          end
        end)

      {%{sim | organisms: orgs}, Enum.reverse(branches), Enum.reverse(rebranch)}
    end
  end

  # O grupo escolhido da espécie, ou nil.
  defp pick(sp, members, sim, rule) do
    ref = sp.blueprint

    deltas =
      members
      |> Enum.map(& &1.genome)
      |> Enum.uniq()
      |> Map.new(fn gid -> {gid, Blueprint.part_delta(ref, Map.fetch!(sim.genomes, gid).bp)} end)

    members
    |> Enum.group_by(&Map.fetch!(deltas, &1.genome))
    |> Enum.filter(fn {delta, group} ->
      Blueprint.part_distance(delta) >= rule.diff and length(group) >= rule.min and
        Enum.count(group, &(not &1.mutated)) >= rule.inherited
    end)
    |> case do
      [] -> nil
      groups -> groups |> Enum.min_by(fn {delta, g} -> {-length(g), delta} end) |> elem(1)
    end
  end

  defp register(sim, sp, group) do
    root = Map.get(sp, :root, sp.id)
    region = region(sim.bounds.map, group)
    {id, code} = next_id(sim, sp)

    gid =
      group
      |> Enum.frequencies_by(& &1.genome)
      |> Enum.min_by(fn {gid, n} -> {-n, gid} end)
      |> elem(0)

    name = name(sim.bounds, root, sp, region)

    branch =
      sim.genomes
      |> Map.fetch!(gid)
      |> Map.fetch!(:bp)
      |> Traits.species(sim.catalog, %{id: id, code: code, name: name})
      |> Map.merge(%{parent: sp.id, root: root, region: region, born_ms: sim.now_ms})

    # Ramo e mãe tiveram indivíduos: os dois podem se extinguir (o ramo nasce
    # sem fundadoras, então `next_seq` não diz isso).
    sim = Sim.add_species(sim, branch, founders: 0)
    {%{sim | populated: sim.populated |> MapSet.put(id) |> MapSet.put(sp.id)}, branch}
  end

  # k = último k da mãe (`branch_seq`, monotônico: a poda não o zera) + 1; se o
  # id já existe, o próximo livre (rede de segurança).
  defp next_id(sim, sp) do
    k = Map.get(sim.branch_seq, sp.id, 0) + 1

    k
    |> Stream.iterate(&(&1 + 1))
    |> Enum.find(&(not Map.has_key?(sim.bounds.species, "#{sp.id}.#{&1}")))
    |> then(&{"#{sp.id}.#{&1}", "#{sp.code}.#{&1}"})
  end

  # Região (id em string) com mais membros; empate pela ordem de `map.regions`.
  defp region(map, group) do
    counts = Enum.frequencies_by(group, fn %{pos: {x, _, z}} -> WMap.region_at(map, x, z) end)

    {best, _} =
      Enum.reduce(map.regions, {nil, 0}, fn %{id: id}, {best, n} ->
        c = Map.get(counts, id, 0)
        if c > n, do: {id, c}, else: {best, n}
      end)

    Atom.to_string(best)
  end

  # "<nome da raiz> · <Região>", com " 2", " 3"… se a raiz já tem esse nome.
  defp name(bounds, root, sp, region) do
    root_name =
      case bounds.species do
        %{^root => %{name: n}} -> n
        _ -> sp.name
      end

    base = "#{root_name} · #{Map.get(@region_names, region, region)}"

    taken =
      for s <- bounds.species_list,
          Map.get(s, :root, s.id) == root,
          into: MapSet.new(),
          do: s.name

    if MapSet.member?(taken, base) do
      2
      |> Stream.iterate(&(&1 + 1))
      |> Enum.find(&(not MapSet.member?(taken, "#{base} #{&1}")))
      |> then(&"#{base} #{&1}")
    else
      base
    end
  end
end
