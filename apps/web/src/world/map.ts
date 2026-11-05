// Mapa compartilhado do gate E1: o mesmo JSON que o servidor (Abyss.World.Map) lê.
import map from '../../../../shared/world/map-e1.json';

export type RegionId = 'jardim' | 'floresta' | 'planicie';

export interface Region {
  id: RegionId;
  center: [number, number];
  radius: number;
  flora_patches: number;
  particle_share: number;
}

export interface Sponge {
  x: number;
  z: number;
  r: number;
  h: number;
}

export interface WorldMap {
  id: string;
  y_min: number;
  y_max: number;
  particle_rest_y: number;
  regions: Region[];
  vents: [number, number][];
  sponges: Sponge[];
}

export const MAP = map as WorldMap;

/** Largura (em unidades de profundidade de borda) da mistura suave entre regiões. */
const BLEND = 2;

const depthIn = (r: Region, x: number, z: number) =>
  r.radius - Math.hypot(x - r.center[0], z - r.center[1]);

function deepest(x: number, z: number): { depth: number; region: Region } {
  let best = MAP.regions[0];
  let bestDepth = depthIn(best, x, z);
  for (const r of MAP.regions) {
    const d = depthIn(r, x, z);
    if (d > bestDepth) {
      best = r;
      bestDepth = d;
    }
  }
  return { depth: bestDepth, region: best };
}

/** max_i(raio_i - dist(p, centro_i)): positivo dentro de alguma região. */
export const edgeDepth = (x: number, z: number): number => deepest(x, z).depth;

export const regionAt = (x: number, z: number): RegionId => deepest(x, z).region.id;

/** Pesos suaves por região (softmax da profundidade de borda, largura `blend`); somam 1. */
export function regionWeights(x: number, z: number, blend: number = BLEND): Record<RegionId, number> {
  const top = edgeDepth(x, z);
  const raw = MAP.regions.map((r) => Math.exp((depthIn(r, x, z) - top) / blend));
  const sum = raw.reduce((a, b) => a + b, 0);
  const out = { jardim: 0, floresta: 0, planicie: 0 } as Record<RegionId, number>;
  MAP.regions.forEach((r, i) => {
    out[r.id] = raw[i] / sum;
  });
  return out;
}

/**
 * O mesmo que `regionWeights`, escrito em `out` e sem alocar (para chamadas a cada quadro).
 * Devolve `out`.
 */
export function regionWeightsInto(
  x: number,
  z: number,
  out: Record<RegionId, number>,
  blend: number = BLEND,
): Record<RegionId, number> {
  const regions = MAP.regions;
  let top = -Infinity;
  for (let i = 0; i < regions.length; i++) top = Math.max(top, depthIn(regions[i], x, z));
  out.jardim = 0;
  out.floresta = 0;
  out.planicie = 0;
  let sum = 0;
  for (let i = 0; i < regions.length; i++) {
    const w = Math.exp((depthIn(regions[i], x, z) - top) / blend);
    out[regions[i].id] = w;
    sum += w;
  }
  for (let i = 0; i < regions.length; i++) out[regions[i].id] /= sum;
  return out;
}

/** Vetor unitário rumo ao centro da região mais profunda ([0, 0] no próprio centro). */
export function inward(x: number, z: number): [number, number] {
  const { region } = deepest(x, z);
  const dx = region.center[0] - x;
  const dz = region.center[1] - z;
  const len = Math.hypot(dx, dz);
  return len === 0 ? [0, 0] : [dx / len, dz / len];
}
