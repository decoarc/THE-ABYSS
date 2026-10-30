import { Color } from 'three';
import { seabedHeight } from './terrain';

/** Fontes de luz que tingem o leito (corais, almofadas, criaturas). O shader do leito tem esse limite fixo. */
export const MAX_FLOOR_GLOWS = 16;

export interface FloorGlow {
  x: number;
  z: number;
  radius: number;
  /** RGB linear. */
  color: [number, number, number];
  intensity: number;
}

/** Slots fixos: 0–5 corais, 6–7 canteiros de almofadas, 8–12 criaturas, 13–14 chaminés. */
export const FLOOR_SLOTS = {
  coral: 0,
  pads: 6,
  membrana: 8,
  filamento: 9,
  casco: 10,
  celula: 11,
  poliedro: 12,
  vents: 13,
} as const;

/** Monta um FloorGlow a partir de uma cor CSS (convertida para RGB linear). */
export function glowOf(color: string, x: number, z: number, radius: number, intensity: number): FloorGlow {
  const c = new Color(color);
  return { x, z, radius, intensity, color: [c.r, c.g, c.b] };
}

export interface FloorGlowStore {
  set(slot: number, g: FloorGlow): void;
  clear(slot: number): void;
  /** Escreve os slots ativos em sequência (`pos`: x, z, raio, intensidade; `col`: rgb) e devolve quantos. */
  pack(pos: Float32Array, col: Float32Array): number;
}

export function createFloorGlowStore(): FloorGlowStore {
  const slots: (FloorGlow | null)[] = new Array(MAX_FLOOR_GLOWS).fill(null);
  const valid = (slot: number) => Number.isInteger(slot) && slot >= 0 && slot < MAX_FLOOR_GLOWS;
  return {
    set(slot, g) {
      if (!valid(slot)) return;
      const cur = slots[slot];
      // Reaproveita o objeto do slot: criaturas chamam isto a cada quadro.
      if (cur) {
        cur.x = g.x;
        cur.z = g.z;
        cur.radius = g.radius;
        cur.intensity = g.intensity;
        cur.color[0] = g.color[0];
        cur.color[1] = g.color[1];
        cur.color[2] = g.color[2];
      } else {
        slots[slot] = { ...g, color: [...g.color] };
      }
    },
    clear(slot) {
      if (valid(slot)) slots[slot] = null;
    },
    pack(pos, col) {
      let n = 0;
      for (const g of slots) {
        if (!g) continue;
        pos.set([g.x, g.z, g.radius, g.intensity], n * 4);
        col.set(g.color, n * 3);
        n++;
      }
      return n;
    },
  };
}

export const floorGlows = createFloorGlowStore();

/** Altura acima do chão a partir da qual uma criatura deixa de tingir o leito. */
const CREATURE_GLOW_REACH = 8;
const scratch: FloorGlow = { x: 0, z: 0, radius: 0, intensity: 0, color: [0, 0, 0] };

/**
 * Brilho de uma criatura no chão logo abaixo dela: mais fraco e mais espalhado
 * quanto mais alto ela está. `color` em RGB linear.
 */
export function setCreatureGlow(
  slot: number,
  color: [number, number, number],
  x: number,
  y: number,
  z: number,
  strength: number,
  store: FloorGlowStore = floorGlows,
): void {
  const h = Math.max(0, y - seabedHeight(x, z));
  scratch.x = x;
  scratch.z = z;
  scratch.radius = 2 + h * 0.6;
  scratch.intensity = strength * Math.max(0, 1 - h / CREATURE_GLOW_REACH);
  scratch.color = color;
  store.set(slot, scratch);
}
