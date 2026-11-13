import type { OrganismInfo, SpeciesInfo } from '../services/wire';

export interface LineageNode {
  species: SpeciesInfo;
  living: number;
  extinctMs: number | null;
  children: LineageNode[];
}

const byBirth = (a: SpeciesInfo, b: SpeciesInfo) =>
  (a.born_ms ?? 0) - (b.born_ms ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Árvore de uma raiz: filhos pela ordem de nascimento e depois pelo id; null se a raiz não existe. */
export function buildLineage(
  species: readonly SpeciesInfo[],
  livingBySpecies: ReadonlyMap<string, number>,
  extinct: ReadonlyMap<string, number>,
  rootId: string,
): LineageNode | null {
  const kids = new Map<string, SpeciesInfo[]>();
  let root: SpeciesInfo | undefined;
  for (const s of species) {
    if (s.id === rootId) root = s;
    if (s.parent === null) continue;
    const list = kids.get(s.parent);
    if (list) list.push(s);
    else kids.set(s.parent, [s]);
  }
  if (!root) return null;
  const seen = new Set<string>();
  const make = (s: SpeciesInfo): LineageNode => {
    seen.add(s.id);
    return {
      species: s,
      living: livingBySpecies.get(s.id) ?? 0,
      extinctMs: extinct.get(s.id) ?? null,
      children: (kids.get(s.id) ?? []).filter((c) => !seen.has(c.id)).sort(byBirth).map(make),
    };
  };
  return make(root);
}

/** Raiz da árvore de uma espécie (a própria, se for raiz); null se desconhecida. */
export function rootOf(species: readonly SpeciesInfo[], speciesId: string): string | null {
  const byId = new Map(species.map((s) => [s.id, s]));
  let cur = byId.get(speciesId);
  if (!cur) return null;
  for (let n = 0; cur.parent !== null && n < 64; n++) {
    const up = byId.get(cur.parent);
    if (!up) return cur.root;
    cur = up;
  }
  return cur.id;
}

/** O organismo vivo de menor id do ramo; null se não há. */
export function firstLiving(roster: readonly OrganismInfo[], speciesId: string): string | null {
  let best: string | null = null;
  for (const o of roster) if (o.species === speciesId && (best === null || o.id < best)) best = o.id;
  return best;
}
