import { API_URL } from '../genesis/genesisApi';

/** Uma espécie ou ramo achado pelo nome (sem nenhum dado de criadora). */
export interface SearchResult {
  id: string;
  name: string;
  /** Raiz da linhagem ("sp3"). */
  root: string;
  alive: boolean;
}

export type HistoryCause = 'starvation' | 'old_age' | 'predation' | 'branched';

export interface FinalShare {
  cause: Exclude<HistoryCause, 'branched'>;
  predator_name: string | null;
  /** Fração das mortes nos últimos 30 min, 0..1 com 2 casas. */
  share: number;
}

export interface HistoryExtinction {
  /** ISO 8601, hora real. */
  at: string;
  /** null = extinção de antes do gate P (causa não registrada). */
  cause: HistoryCause | null;
  predator: { id: string; name: string } | null;
  final: FinalShare[];
}

export interface HistoryNode {
  id: string;
  name: string;
  born_at: string | null;
  region: string | null;
  /** Diferença de peças em relação à mãe: {"flagelo": 1, "placa": -1}. */
  diff: Record<string, number>;
  extinct: HistoryExtinction | null;
  children: HistoryNode[];
}

export interface HistoryTree {
  root: HistoryNode;
  /** Datas (ISO) em que o mundo recomeçou durante a vida da linhagem. */
  restarts: string[];
}

/** Busca por nome. Lança em erro de rede ou resposta inesperada. */
export async function searchSpecies(q: string): Promise<SearchResult[]> {
  const res = await fetch(`${API_URL}/api/species/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`busca: ${res.status}`);
  const json = (await res.json()) as { results: SearchResult[] };
  return json.results;
}

/** História da raiz; null se ela não existe. Lança em erro de rede ou resposta inesperada. */
export async function fetchHistory(rootId: string): Promise<HistoryTree | null> {
  const res = await fetch(`${API_URL}/api/species/${encodeURIComponent(rootId)}/history`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`história: ${res.status}`);
  return (await res.json()) as HistoryTree;
}
