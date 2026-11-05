import { MAP } from '../world/map';
import type { ParticleRow, TickMessage, Vec3, WorldSnapshot } from './wire';

/** Quantos ticks de digest ficam guardados (mesma janela do histórico de posições). */
const HISTORY_TICKS = 32;
/** A partícula começa a sumir este tanto antes do fim da vida. */
const FADE_MS = 30_000;

export interface Particle {
  id: number;
  /** Posição em `bornMs`. */
  p0: Vec3;
  v: Vec3;
  bornMs: number;
  lifeMs: number;
}

export interface FoodStore {
  applySnapshot(s: WorldSnapshot): void;
  /** Aplica `f`, depois `ps`, depois `pr`: partícula nascida e removida no mesmo tick fica ausente. */
  applyTick(t: TickMessage): void;
  /** `[x, z, level]` × n, com o nível atual. Não altere o array devolvido. */
  flora(): Float32Array;
  /** Incrementa a cada mudança de flora. */
  floraVersion(): number;
  particles(): ReadonlyMap<number, Particle>;
  /** Escreve em `out` a posição da partícula no instante `serverMs`. */
  particlePosition(p: Particle, serverMs: number, out: Vec3): void;
  particleAlpha(p: Particle, serverMs: number): number;
  counts(): { floraSum: number; particles: number };
  /** Resumo canônico do estado ao fim do tick, se estiver no histórico recente. */
  digestAt(tick: number): string | null;
}

function toParticle(r: ParticleRow): Particle {
  return { id: r[0], p0: [r[1], r[2], r[3]], v: [r[4], r[5], r[6]], bornMs: r[7], lifeMs: r[8] };
}

export function createFoodStore(): FoodStore {
  let flora = new Float32Array(0);
  let version = 0;
  let floraSum = 0;
  const particles = new Map<number, Particle>();
  const digests = new Map<number, string>();

  function sumFlora() {
    let s = 0;
    for (let i = 2; i < flora.length; i += 3) s += flora[i];
    floraSum = s;
  }

  function remember(tick: number) {
    const ids = [...particles.keys()].sort((a, b) => a - b);
    digests.set(tick, `${tick}:${floraSum.toFixed(2)}:${ids.join(',')}`);
    // Os ticks entram em ordem crescente: o mais antigo é o primeiro da iteração.
    while (digests.size > HISTORY_TICKS) digests.delete(digests.keys().next().value as number);
  }

  return {
    applySnapshot(s) {
      flora = new Float32Array(s.flora.length * 3);
      s.flora.forEach((r, i) => {
        flora[i * 3] = r[0];
        flora[i * 3 + 1] = r[1];
        flora[i * 3 + 2] = r[2];
      });
      particles.clear();
      for (const r of s.particles) particles.set(r[0], toParticle(r));
      digests.clear();
      version++;
      sumFlora();
      remember(s.tick);
    },

    applyTick(t) {
      let changed = false;
      for (const [idx, level] of t.f) {
        if (!Number.isInteger(idx) || idx < 0 || idx * 3 >= flora.length) continue;
        flora[idx * 3 + 2] = level;
        changed = true;
      }
      if (changed) {
        version++;
        sumFlora();
      }
      for (const r of t.ps) if (!particles.has(r[0])) particles.set(r[0], toParticle(r));
      for (const id of t.pr) particles.delete(id);
      remember(t.tick);
    },

    flora: () => flora,
    floraVersion: () => version,
    particles: () => particles,

    particlePosition(p, serverMs, out) {
      let dt = Math.max(0, serverMs - p.bornMs) / 1000;
      const vy = p.v[1];
      const rest = MAP.particle_rest_y;
      let y = p.p0[1] + vy * dt;
      if (vy < 0 && y <= rest) {
        // Chegou ao leito: para aqui, em x, y e z.
        dt = Math.max(0, (rest - p.p0[1]) / vy);
        y = rest;
      }
      out[0] = p.p0[0] + p.v[0] * dt;
      out[1] = y;
      out[2] = p.p0[2] + p.v[2] * dt;
    },

    particleAlpha(p, serverMs) {
      const left = p.bornMs + p.lifeMs - serverMs;
      return Math.max(0, Math.min(1, left / FADE_MS));
    },

    counts: () => ({ floraSum, particles: particles.size }),
    digestAt: (tick) => digests.get(tick) ?? null,
  };
}
