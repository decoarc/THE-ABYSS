import { createFoodStore, type FoodStore } from './foodStore';
import { hermite } from './interpolate';
import type { OrganismInfo, SpeciesInfo, TickMessage, Vec3, WorldSnapshot } from './wire';

export type ConnectionStatus = 'connecting' | 'live';

export const RENDER_DELAY_TICKS = 2;
export const MAX_EXTRAPOLATE_MS = 300;
export const BUFFER_SAMPLES = 8;
/** Quanto tempo quem morre de fome ou velhice continua no roster, parado, desfazendo-se. */
export const DISSOLVE_MS = 1500;

const OFFSET_WINDOW = 20;
const STRIDE = 7; // t, x, y, z, vx, vy, vz

export interface Vitals {
  /** Energia 0..1. */
  energy: number;
  juvenile: boolean;
  dividing: boolean;
  /** Instante local em que o bit de jovem caiu; null enquanto jovem (ou se nasceu adulto). */
  maturedAtMs: number | null;
  /** Instante local em que o bit de divisão ligou; null fora da divisão. */
  dividingSinceMs: number | null;
  /** Instante local da morte por fome ou velhice (fantasma); null para os vivos. */
  dyingSinceMs: number | null;
}

export interface WorldStore {
  applySnapshot(s: WorldSnapshot, localMs: number): void;
  applyTick(t: TickMessage, localMs: number): 'ok' | 'stale' | 'resync';
  /** Vivos (na ordem de `o`) e fantasmas. Muda de identidade só quando alguém entra ou sai. */
  roster(): readonly OrganismInfo[];
  /** Só os vivos: os fantasmas não contam. */
  livingCount(): number;
  species(): readonly SpeciesInfo[];
  /** Espécies extintas: id -> ms do servidor. Nova identidade a cada mudança. */
  extinct(): ReadonlyMap<string, number>;
  worldId(): string | null;
  /** Flora e partículas canônicas. */
  food(): FoodStore;
  bounds(): WorldSnapshot['bounds'] | null;
  /** Escala do corpo das criaturas vinda do snapshot; 1 antes dele. */
  creatureScale(): number;
  /** Raio do jovem em fração do adulto; 1 antes do snapshot. */
  juvenileScale(): number;
  /** Duração da fase "dividindo", em segundos; 2 antes do snapshot. */
  divideS(): number;
  /** Preenche `out` com o estado vital do organismo (vivo ou fantasma); false se desconhecido. */
  vitals(id: string, out: Vitals): boolean;
  sample(id: string, localMs: number, outPos: Vec3, outVel: Vec3): boolean;
  serverNow(localMs: number): number;
  status(): ConnectionStatus;
  setStatus(s: ConnectionStatus): void;
  subscribe(fn: () => void): () => void;
  lastTick(): number;
  /** Posições canônicas de cada vivo no tick pedido, se ainda estiver no histórico recente. */
  positionsAt(tick: number): Record<string, Vec3> | null;
  /** Só para teste. */
  debugBufferSize(id: string): number;
}

/** Quantos ticks recentes ficam guardados para `positionsAt` (~3 s a 10 Hz). */
const HISTORY_TICKS = 32;

interface HistoryEntry {
  tick: number;
  ids: readonly string[];
  /** Uma linha por organismo, na ordem de `ids`: x, y, z, vx, vy, vz. */
  rows: ReadonlyArray<ArrayLike<number>>;
}

interface Ring {
  data: Float64Array;
  head: number; // próxima escrita
  count: number;
}

interface Live {
  info: OrganismInfo;
  ring: Ring;
  energy: number;
  juvenile: boolean;
  dividing: boolean;
  maturedAtMs: number | null;
  dividingSinceMs: number | null;
}

interface Ghost {
  info: OrganismInfo;
  pos: Vec3;
  energy: number;
  dyingSinceMs: number;
  /** Estado vital no instante da morte: o desfazer parte do tamanho e do alongamento que estavam na tela. */
  juvenile: boolean;
  dividing: boolean;
  maturedAtMs: number | null;
  dividingSinceMs: number | null;
}

const makeLive = (info: OrganismInfo, localMs: number): Live => ({
  info,
  ring: { data: new Float64Array(BUFFER_SAMPLES * STRIDE), head: 0, count: 0 },
  energy: info.e,
  juvenile: info.stage === 'juvenile',
  dividing: info.dividing,
  maturedAtMs: null,
  dividingSinceMs: info.dividing ? localMs : null,
});

export function createWorldStore(): WorldStore {
  let worldId: string | null = null;
  let bounds: WorldSnapshot['bounds'] | null = null;
  let creatureScale = 1;
  let juvenileScale = 1;
  let divideS = 2;
  let tickHz = 10;
  let lastTick = -1;
  let roster: readonly OrganismInfo[] = [];
  let species: readonly SpeciesInfo[] = [];
  let extinct: ReadonlyMap<string, number> = new Map();
  let lives: Live[] = [];
  const ghosts: Ghost[] = [];
  let index = new Map<string, number>();
  let history: HistoryEntry[] = [];
  let rosterIds: readonly string[] = [];
  let status: ConnectionStatus = 'connecting';
  const food = createFoodStore();
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

  function remember(tick: number, ids: readonly string[], rows: ReadonlyArray<ArrayLike<number>>) {
    history.push({ tick, ids, rows });
    if (history.length > HISTORY_TICKS) history.shift();
  }

  function notify() {
    for (const fn of listeners) fn();
  }

  function rebuildLives() {
    index = new Map();
    lives.forEach((l, i) => index.set(l.info.id, i));
    rosterIds = lives.map((l) => l.info.id);
  }

  function rebuildRoster() {
    roster = [...lives.map((l) => l.info), ...ghosts.map((g) => g.info)];
  }

  // Sem closure nem alocação: sample e vitals rodam por quadro.
  function findGhost(id: string): Ghost | undefined {
    for (let i = 0; i < ghosts.length; i++) if (ghosts[i].info.id === id) return ghosts[i];
    return undefined;
  }

  const store: WorldStore = {
    applySnapshot(s, localMs) {
      worldId = s.world_id;
      bounds = s.bounds;
      creatureScale = s.creature_scale;
      juvenileScale = s.juvenile_scale;
      divideS = s.divide_s;
      tickHz = s.tick_hz;
      lastTick = s.tick;
      species = s.species;
      const ex = new Map<string, number>();
      for (const sp of s.species) if (sp.extinct_ms !== null) ex.set(sp.id, sp.extinct_ms);
      extinct = ex;
      ghosts.length = 0;
      history = [];
      food.applySnapshot(s);
      diffCount = 0;
      diffHead = 0;
      observe(localMs, s.server_ms);
      lives = s.organisms.map((org) => {
        const l = makeLive(org, localMs);
        push(l.ring, s.server_ms, org.p[0], org.p[1], org.p[2], org.v[0], org.v[1], org.v[2]);
        return l;
      });
      rebuildLives();
      rebuildRoster();
      remember(s.tick, rosterIds, s.organisms.map((o) => [...o.p, ...o.v]));
      notify();
    },

    applyTick(t, localMs) {
      // Antes do snapshot não há o que aplicar nem o que ressincronizar: o join já vai trazer um.
      if (worldId === null) return 'stale';
      if (t.world_id !== worldId) return 'resync';
      if (t.tick <= lastTick) return 'stale';
      // Comida, nascimentos e mortes chegam em deltas: perder um tick deixa o estado errado até o próximo snapshot.
      if (t.tick !== lastTick + 1) return 'resync';

      // Valida tudo antes de mexer: morto desconhecido ou contagem divergente pedem resync sem escrever nada.
      for (const [id] of t.d) if (!index.has(id)) return 'resync';
      if (t.o.length !== lives.length - t.d.length + t.b.length) return 'resync';

      lastTick = t.tick;
      food.applyTick(t);
      observe(localMs, t.server_ms);

      let rosterChanged = false;
      let changed = false;

      // Fantasmas cujo desfazer acabou saem.
      for (let i = ghosts.length - 1; i >= 0; i--) {
        if (localMs - ghosts[i].dyingSinceMs >= DISSOLVE_MS) {
          ghosts.splice(i, 1);
          rosterChanged = true;
        }
      }

      if (t.d.length > 0) {
        const dead = new Map(t.d);
        for (const l of lives) {
          const cause = dead.get(l.info.id);
          if (cause === undefined) continue;
          changed = true;
          if (cause === 'predation') {
            rosterChanged = true;
            continue;
          }
          // Congela onde o cliente a desenhava agora (atrasada no tempo), não na amostra mais nova: sem salto.
          const pos: Vec3 = [0, 0, 0];
          store.sample(l.info.id, localMs, pos, [0, 0, 0]);
          ghosts.push({
            info: l.info, pos, energy: l.energy, dyingSinceMs: localMs,
            juvenile: l.juvenile, dividing: l.dividing, maturedAtMs: l.maturedAtMs, dividingSinceMs: l.dividingSinceMs,
          });
        }
        lives = lives.filter((l) => !dead.has(l.info.id));
      }

      if (t.b.length > 0) {
        for (const org of t.b) lives.push(makeLive(org, localMs));
        rosterChanged = true;
        changed = true;
      }

      if (t.d.length > 0 || t.b.length > 0) rebuildLives();

      for (let i = 0; i < lives.length; i++) {
        const l = lives[i];
        const row = t.o[i];
        push(l.ring, t.server_ms, row[0], row[1], row[2], row[3], row[4], row[5]);
        l.energy = row[6];
        const juvenile = (row[7] & 1) !== 0;
        if (l.juvenile && !juvenile) l.maturedAtMs = localMs;
        l.juvenile = juvenile;
        const dividing = (row[7] & 2) !== 0;
        if (dividing && !l.dividing) l.dividingSinceMs = localMs;
        else if (!dividing) l.dividingSinceMs = null;
        l.dividing = dividing;
      }

      if (t.x.length > 0) {
        const m = new Map(extinct);
        for (const [id, ms] of t.x) m.set(id, ms);
        extinct = m;
        changed = true;
      }

      if (rosterChanged) rebuildRoster();
      remember(t.tick, rosterIds, t.o);
      if (rosterChanged || changed) notify();
      return 'ok';
    },

    roster: () => roster,
    livingCount: () => lives.length,
    species: () => species,
    extinct: () => extinct,
    worldId: () => worldId,
    food: () => food,
    bounds: () => bounds,
    creatureScale: () => creatureScale,
    juvenileScale: () => juvenileScale,
    divideS: () => divideS,

    vitals(id, out) {
      const idx = index.get(id);
      if (idx !== undefined) {
        const l = lives[idx];
        out.energy = l.energy;
        out.juvenile = l.juvenile;
        out.dividing = l.dividing;
        out.maturedAtMs = l.maturedAtMs;
        out.dividingSinceMs = l.dividingSinceMs;
        out.dyingSinceMs = null;
        return true;
      }
      const g = findGhost(id);
      if (!g) return false;
      out.energy = g.energy;
      out.juvenile = g.juvenile;
      out.dividing = g.dividing;
      out.maturedAtMs = g.maturedAtMs;
      out.dividingSinceMs = g.dividingSinceMs;
      out.dyingSinceMs = g.dyingSinceMs;
      return true;
    },

    sample(id, localMs, outPos, outVel) {
      const idx = index.get(id);
      if (idx === undefined) {
        const g = findGhost(id);
        if (!g) return false;
        outPos[0] = g.pos[0]; outPos[1] = g.pos[1]; outPos[2] = g.pos[2];
        outVel[0] = 0; outVel[1] = 0; outVel[2] = 0;
        return true;
      }
      const r = lives[idx].ring;
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

    lastTick: () => lastTick,
    positionsAt(tick) {
      for (let i = history.length - 1; i >= 0; i--) {
        const e = history[i];
        if (e.tick !== tick) continue;
        const out: Record<string, Vec3> = {};
        e.ids.forEach((id, k) => {
          const row = e.rows[k];
          out[id] = [row[0], row[1], row[2]];
        });
        return out;
      }
      return null;
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
      return idx === undefined ? 0 : lives[idx].ring.count;
    },
  };
  return store;
}
