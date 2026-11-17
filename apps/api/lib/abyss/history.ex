defmodule Abyss.History do
  @moduledoc """
  História das espécies para a criadora (gate P): busca por nome e a árvore anotada de uma
  raiz (ramos com nascimento e diferença de peças; extinções com causa, predador e a
  divisão das mortes nos últimos 30 min do relógio do mundo; recomeços do mundo). Só
  leitura e nunca e-mail: as consultas escolhem colunas, nunca o criador.
  """

  import Ecto.Query

  alias Abyss.Genesis.{Blueprint, BranchRecord, DeathCount, SpeciesRecord}
  alias Abyss.Repo
  alias Abyss.World.{Species, WorldEvent}

  @max_q 64
  @min_q 2
  @limit 20
  @final_ms 1_800_000

  @doc """
  Espécies e ramos cujo nome contém `q` (sem diferenciar maiúscula nem acento; `%`, `_` e
  `\\` são literais). `q` é aparado e cortado em #{@max_q} caracteres; menos de #{@min_q}
  devolve `[]`. Até #{@limit}, vivas primeiro e depois por nome.
  """
  @spec search(String.t()) :: [
          %{id: String.t(), name: String.t(), root: String.t(), alive: boolean}
        ]
  def search(q) when is_binary(q) do
    q = q |> String.trim() |> String.slice(0, @max_q)

    if String.length(q) < @min_q do
      []
    else
      pattern = "%" <> escape_like(q) <> "%"

      roots =
        from(s in SpeciesRecord,
          where:
            fragment("unaccent(lower(?)) LIKE unaccent(lower(?)) ESCAPE '\\'", s.name, ^pattern),
          # Vivas primeiro já no banco: o limite não corta uma viva para mostrar extintas.
          order_by: [asc: fragment("? IS NOT NULL", s.extinct_at), asc: s.name, asc: s.id],
          limit: @limit,
          select: %{id: s.id, name: s.name, extinct_at: s.extinct_at}
        )
        |> Repo.all(log: false)
        |> Enum.map(
          &%{id: "sp#{&1.id}", name: &1.name, root: "sp#{&1.id}", alive: is_nil(&1.extinct_at)}
        )

      branches =
        from(b in BranchRecord,
          where:
            fragment("unaccent(lower(?)) LIKE unaccent(lower(?)) ESCAPE '\\'", b.name, ^pattern),
          order_by: [asc: fragment("? IS NOT NULL", b.extinct_at), asc: b.name, asc: b.id],
          limit: @limit,
          select: %{id: b.id, name: b.name, root: b.root_species_id, extinct_at: b.extinct_at}
        )
        |> Repo.all(log: false)
        |> Enum.map(
          &%{id: &1.id, name: &1.name, root: "sp#{&1.root}", alive: is_nil(&1.extinct_at)}
        )

      (roots ++ branches)
      |> Enum.sort_by(&{not &1.alive, &1.name, &1.id})
      |> Enum.take(@limit)
    end
  end

  def search(_), do: []

  defp escape_like(q), do: String.replace(q, ~r/[\\%_]/, "\\\\\\0")

  @doc "Árvore da raiz `\"sp<N>\"` com a história (formato da API do gate P)."
  @spec tree(String.t()) :: {:ok, map} | :not_found
  def tree("sp" <> n) do
    with {id, ""} when id > 0 <- Integer.parse(n),
         %SpeciesRecord{} = root <- Repo.get(SpeciesRecord, id, log: false) do
      branches =
        from(b in BranchRecord,
          where: b.root_species_id == ^id,
          order_by: [asc: b.born_at, asc: b.id]
        )
        |> Repo.all(log: false)

      names = predator_names([root | branches])
      by_parent = Enum.group_by(branches, & &1.parent_id)
      root_id = "sp#{id}"

      node =
        node(
          %{
            id: root_id,
            name: root.name,
            born_at: root.published_at,
            region: nil,
            diff: %{},
            record: root
          },
          root.blueprint,
          by_parent,
          names
        )

      {:ok, %{root: node, restarts: restarts(root, branches)}}
    else
      _ -> :not_found
    end
  end

  def tree(_), do: :not_found

  defp node(n, bp, by_parent, names) do
    children =
      for b <- Map.get(by_parent, n.id, []) do
        node(
          %{
            id: b.id,
            name: b.name,
            born_at: b.born_at,
            region: b.region,
            diff: Blueprint.part_delta(bp, b.blueprint),
            record: b
          },
          b.blueprint,
          by_parent,
          names
        )
      end

    %{
      id: n.id,
      name: n.name,
      born_at: iso(n.born_at),
      region: n.region,
      diff: n.diff,
      extinct: extinct(n.id, n.record, names),
      children: children
    }
  end

  defp extinct(_id, %{extinct_at: nil}, _names), do: nil

  defp extinct(id, r, names) do
    %{
      at: iso(r.extinct_at),
      cause: r.extinct_cause,
      predator:
        r.extinct_predator_id && %{id: r.extinct_predator_id, name: names.(r.extinct_predator_id)},
      final: final(id, r, names)
    }
  end

  # Divisão das mortes nos últimos 30 min do relógio do mundo antes da extinção (intervalos
  # de 5 min que tocam a janela), por causa e predador.
  defp final(_id, %{extinct_cause: cause}, _names) when cause in [nil, "branched"], do: []
  defp final(_id, %{extinct_world_ms: nil}, _names), do: []

  defp final(id, %{extinct_world_ms: w, extinct_epoch: epoch}, names) do
    from_ms = DeathCount.bucket(w - @final_ms)

    rows =
      from(d in DeathCount,
        where:
          d.species_id == ^id and d.epoch == ^epoch and d.bucket_ms >= ^from_ms and
            d.bucket_ms <= ^w,
        group_by: [d.cause, d.predator_id],
        select: {d.cause, d.predator_id, sum(d.n)}
      )
      |> Repo.all(log: false)

    total = rows |> Enum.map(&elem(&1, 2)) |> Enum.sum()

    rows
    |> Enum.map(fn {cause, pred, n} ->
      %{cause: cause, predator_name: pred && names.(pred), share: Float.round(n / total, 2)}
    end)
    |> Enum.sort_by(&{-&1.share, &1.cause, &1.predator_name || ""})
  end

  # Resolve nomes de predadores: criada, ramo, espécie de teste ou desconhecido.
  defp predator_names(records) do
    ids = for r <- records, p = r.extinct_predator_id, do: p

    death_preds =
      for r <- records, not is_nil(r.extinct_world_ms) do
        id = record_id(r)

        from(d in DeathCount,
          where: d.species_id == ^id and not is_nil(d.predator_id),
          distinct: true,
          select: d.predator_id
        )
        |> Repo.all(log: false)
      end

    ids = Enum.uniq(ids ++ List.flatten(death_preds))
    {branch_ids, root_ids} = Enum.split_with(ids, &String.contains?(&1, "."))

    root_nums = for "sp" <> n <- root_ids, {i, ""} <- [Integer.parse(n)], do: i

    roots =
      from(s in SpeciesRecord, where: s.id in ^root_nums, select: {s.id, s.name})
      |> Repo.all(log: false)
      |> Map.new(fn {i, name} -> {"sp#{i}", name} end)

    branches =
      from(b in BranchRecord, where: b.id in ^branch_ids, select: {b.id, b.name})
      |> Repo.all(log: false)
      |> Map.new()

    tests = Map.new(Species.all(), &{Atom.to_string(&1.id), &1.name})
    known = roots |> Map.merge(branches) |> Map.merge(tests)

    fn id -> Map.get(known, id, "predador desconhecido") end
  end

  defp record_id(%SpeciesRecord{id: id}), do: "sp#{id}"
  defp record_id(%BranchRecord{id: id}), do: id

  # Recomeços do mundo durante a vida da linhagem (do nascimento da raiz até a última
  # extinção, ou até hoje se algum nó vive).
  defp restarts(root, branches) do
    records = [root | branches]

    until =
      if Enum.any?(records, &is_nil(&1.extinct_at)),
        do: nil,
        else: records |> Enum.map(& &1.extinct_at) |> Enum.max(DateTime)

    q = from(e in WorldEvent, where: e.kind == "restart" and e.at >= ^root.published_at)
    q = if until, do: from(e in q, where: e.at <= ^until), else: q

    q |> order_by(asc: :at) |> select([e], e.at) |> Repo.all(log: false) |> Enum.map(&iso/1)
  end

  defp iso(nil), do: nil
  defp iso(%DateTime{} = dt), do: DateTime.to_iso8601(dt)
end
