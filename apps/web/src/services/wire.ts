// Tipos que espelham o formato "no fio" do canal world:main (JSON).
export type Vec3 = [number, number, number];

export interface SpeciesInfo {
  id: string;
  code: string;
  name: string;
  body_radius: number;
}

export interface OrganismInfo {
  id: string;
  species: string;
  born_ms: number;
  p: Vec3;
  v: Vec3;
}

export interface WorldSnapshot {
  world_id: string;
  tick: number;
  tick_hz: number;
  server_ms: number;
  bounds: { radius: number; y_min: number; y_max: number };
  species: SpeciesInfo[];
  organisms: OrganismInfo[];
}

/** Linha de `o`: [x, y, z, vx, vy, vz], na mesma ordem de `organisms` do snapshot. */
export type TickRow = [number, number, number, number, number, number];

export interface TickMessage {
  world_id: string;
  tick: number;
  server_ms: number;
  o: TickRow[];
}
