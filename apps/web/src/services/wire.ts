// Tipos que espelham o formato "no fio" do canal world:main (JSON).
export type Vec3 = [number, number, number];

export interface SpeciesInfo {
  id: string;
  code: string;
  name: string;
  /** Raio efetivo (já multiplicado por `creature_scale`). */
  body_radius: number;
  diet: { kind: 'flora' | 'particles' | 'prey'; prey: string[] };
  /** Instante (ms do servidor) da extinção, ou null se a espécie vive. */
  extinct_ms: number | null;
}

export interface OrganismInfo {
  id: string;
  species: string;
  born_ms: number;
  p: Vec3;
  v: Vec3;
  /** Energia 0..1. */
  e: number;
  stage: 'juvenile' | 'adult';
  dividing: boolean;
  /** Geração; fundador = 1. */
  gen: number;
  parent: string | null;
}

export interface WorldSnapshot {
  world_id: string;
  tick: number;
  tick_hz: number;
  server_ms: number;
  map_id: string;
  /** Escala do corpo das criaturas; o cliente desenha cada uma nesse tamanho. */
  creature_scale: number;
  /** Raio do jovem em fração do raio adulto. */
  juvenile_scale: number;
  /** Duração da fase "dividindo", em segundos. */
  divide_s: number;
  /** Faixa vertical nadável; a horizontal vem do mapa (`world/map.ts`). */
  bounds: { y_min: number; y_max: number };
  species: SpeciesInfo[];
  organisms: OrganismInfo[];
  /** Manchas de flora na ordem dos índices. */
  flora: FloraRow[];
  /** Partículas vivas, com `id` crescente. */
  particles: ParticleRow[];
}

/** [x, z, level] */
export type FloraRow = [number, number, number];

/** [id, x, y, z, vx, vy, vz, born_ms, life_ms]; x, y, z são a posição em `born_ms`. */
export type ParticleRow = [number, number, number, number, number, number, number, number, number];

/** Linha de `o`: [x, y, z, vx, vy, vz, e, flags]; flags: bit 1 = jovem, bit 2 = dividindo. */
export type TickRow = [number, number, number, number, number, number, number, number];

export type DeathCause = 'starvation' | 'predation' | 'old_age';

export interface TickMessage {
  world_id: string;
  tick: number;
  server_ms: number;
  /** Uma linha por vivo, na ordem do roster depois de aplicar `d` e `b`. */
  o: TickRow[];
  /** Nascidos neste tick, acrescentados ao fim. */
  b: OrganismInfo[];
  /** Mortos neste tick: [id, causa]. */
  d: [string, DeathCause][];
  /** Extinções: [espécie, ms do servidor]. */
  x: [string, number][];
  /** Manchas cujo nível quantizado mudou: [índice, nível]. */
  f: [number, number][];
  /** Partículas nascidas neste tick. */
  ps: ParticleRow[];
  /** Ids de partículas removidas (comidas ou expiradas). */
  pr: number[];
}
