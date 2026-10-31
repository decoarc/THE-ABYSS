import { hermite } from './interpolate';
import type { OrganismInfo, SpeciesInfo, TickMessage, Vec3, WorldSnapshot } from './wire';

export type ConnectionStatus = 'connecting' | 'live';

export const RENDER_DELAY_TICKS = 2;
export const MAX_EXTRAPOLATE_MS = 300;
export const BUFFER_SAMPLES = 8;

const OFFSET_WINDOW = 20;
const STRIDE = 7; // t, x, y, z, vx, vy, vz

export interface WorldStore {
  applySnapshot(s: WorldSnapshot, localMs: number): void;
  applyTick(t: TickMessage, localMs: number): 'ok' | 'stale' | 'resync';
  roster(): readonly OrganismInfo[];
  species(): readonly SpeciesInfo[];
  worldId(): string | null;
  bounds(): WorldSnapshot['bounds'] | null;
  sample(id: string, localMs: number, outPos: Vec3, outVel: Vec3): boolean;
  serverNow(localMs: number): number;
  status(): ConnectionStatus;
  setStatus(s: ConnectionStatus): void;
  subscribe(fn: () => void): () => void;
  /** Só para teste. */
  debugBufferSize(id: string): number;
}

interface Ring {
  data: Float64Array;
  head: number; // próxima escrita
  count: number;
}

export function createWorldStore(): WorldStore {
  let worldId: string | null = null;
  let bounds: WorldSnapshot['bounds'] | null = null;
  let tickHz = 10;
  let lastTick = -1;
  let roster: readonly OrganismInfo[] = [];
  let species: readonly SpeciesInfo[] = [];
  let rings: Ring[] = [];
  let index = new Map<string, number>();
  let status: ConnectionStatus = 'connecting';
  const listeners = new Set<() => void>();

  // Janela das últimas diferenças (local - server) para o offset mínimo.
  const diffs = new Float64Array(OFFSET_WINDOW);
  let diffCount = 0;
  let diffHead = 0;
  let offset = 0;

  // Scratch reutilizado: sem alocação por chamada de sample.
  const a: Vec3 = [0, 0, 0], av: Vec3 = [0, 0, 0], b: Vec3 = [0, 0, 0], bv: Vec3 = [0, 0, 0];

  function observe(localMs: number, serverMs: number) {
    diffs[diffHead] = localMs - serverMs;
    diffHead = (diffHead + 1) % OFFSET_WINDOW;
    if (diffCount < OFFSET_WINDOW) diffCount++;
    let m = Infinity;
    for (let i = 0; i < diffCount; i++) if (diffs[i] < m) m = diffs[i];
    offset = m;
  }

  function push(r: Ring, t: number, x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const o = r.head * STRIDE;
    const d = r.data;
    d[o] = t; d[o + 1] = x; d[o + 2] = y; d[o + 3] = z;
    d[o + 4] = vx; d[o + 5] = vy; d[o + 6] = vz;
    r.head = (r.head + 1) % BUFFER_SAMPLES;
    if (r.count < BUFFER_SAMPLES) r.count++;
  }

  // Posição no array da i-ésima amostra, da mais antiga (0) à mais nova.
  const slot = (r: Ring, i: number) => ((r.head - r.count + i + BUFFER_SAMPLES) % BUFFER_SAMPLES) * STRIDE;

  function serverNow(localMs: number) {
    return localMs - offset;
  }

  function notify() {
    for (const fn of listeners) fn();
  }

  return {
    applySnapshot(s, localMs) {
      worldId = s.world_id;
      bounds = s.bounds;
      tickHz = s.tick_hz;
      lastTick = s.tick;
      roster = s.organisms;
      species = s.species;
      diffCount = 0;
      diffHead = 0;
      observe(localMs, s.server_ms);
      index = new Map();
      rings = s.organisms.map((org, i) => {
        index.set(org.id, i);
        const r: Ring = { data: new Float64Array(BUFFER_SAMPLES * STRIDE), head: 0, count: 0 };
        push(r, s.server_ms, org.p[0], org.p[1], org.p[2], org.v[0], org.v[1], org.v[2]);
        return r;
      });
      notify();
    },

    applyTick(t, localMs) {
      if (worldId === null || t.world_id !== worldId || t.o.length !== rings.length) return 'resync';
      if (t.tick <= lastTick) return 'stale';
      lastTick = t.tick;
      observe(localMs, t.server_ms);
      for (let i = 0; i < rings.length; i++) {
        const row = t.o[i];
        push(rings[i], t.server_ms, row[0], row[1], row[2], row[3], row[4], row[5]);
      }
      return 'ok';
    },

    roster: () => roster,
    species: () => species,
    worldId: () => worldId,
    bounds: () => bounds,

    sample(id, localMs, outPos, outVel) {
      const idx = index.get(id);
      if (idx === undefined) return false;
      const r = rings[idx];
      const d = r.data;
      const rt = serverNow(localMs) - (RENDER_DELAY_TICKS * 1000) / tickHz;

      const first = slot(r, 0);
      const last = slot(r, r.count - 1);

      // Fora do intervalo bufferizado: extrapola com v, limitado a MAX_EXTRAPOLATE_MS.
      if (rt <= d[first] || rt >= d[last]) {
        const k = rt <= d[first] ? first : last;
        const dt = Math.max(-MAX_EXTRAPOLATE_MS, Math.min(MAX_EXTRAPOLATE_MS, rt - d[k])) / 1000;
        outPos[0] = d[k + 1] + d[k + 4] * dt;
        outPos[1] = d[k + 2] + d[k + 5] * dt;
        outPos[2] = d[k + 3] + d[k + 6] * dt;
        outVel[0] = d[k + 4]; outVel[1] = d[k + 5]; outVel[2] = d[k + 6];
        return true;
      }

      // Segmento [from, to] que contém rt, varrendo do mais novo para o mais antigo.
      let to = last;
      let from = last;
      for (let i = r.count - 2; i >= 0; i--) {
        from = slot(r, i);
        if (d[from] <= rt) break;
        to = from;
      }
      a[0] = d[from + 1]; a[1] = d[from + 2]; a[2] = d[from + 3];
      av[0] = d[from + 4]; av[1] = d[from + 5]; av[2] = d[from + 6];
      b[0] = d[to + 1]; b[1] = d[to + 2]; b[2] = d[to + 3];
      bv[0] = d[to + 4]; bv[1] = d[to + 5]; bv[2] = d[to + 6];
      hermite(a, av, d[from], b, bv, d[to], rt, outPos);
      const u = (rt - d[from]) / (d[to] - d[from]);
      outVel[0] = av[0] + (bv[0] - av[0]) * u;
      outVel[1] = av[1] + (bv[1] - av[1]) * u;
      outVel[2] = av[2] + (bv[2] - av[2]) * u;
      return true;
    },

    serverNow,
    status: () => status,
    setStatus(s) {
      if (s === status) return;
      status = s;
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    debugBufferSize(id) {
      const idx = index.get(id);
      return idx === undefined ? 0 : rings[idx].count;
    },
  };
}
