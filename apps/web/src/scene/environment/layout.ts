import { seabedHeight } from '../terrain';

export interface VentSpec {
  position: [number, number, number];
  height: number;
  radius: number;
  hero: boolean;
}

function vent(x: number, z: number, height: number, radius: number, hero = false): VentSpec {
  return { position: [x, seabedHeight(x, z), z], height, radius, hero };
}

/** Chaminé herói na origem; as demais agrupadas atrás e aos lados dela. */
export const VENTS: VentSpec[] = [
  vent(0, 0, 4.6, 0.95, true),
  vent(-3.3, -2.1, 2.9, 0.7),
  vent(3.0, -3.2, 3.4, 0.75),
  vent(-1.9, 2.3, 1.5, 0.55),
];

export interface ScatterOptions {
  minR: number;
  maxR: number;
  avoid: { center: [number, number]; radius: number }[];
}

/** Pontos XZ uniformes por área no anel [minR, maxR], fora das zonas `avoid`. */
export function scatter(rng: () => number, count: number, opts: ScatterOptions): [number, number][] {
  const { minR, maxR, avoid } = opts;
  const out: [number, number][] = [];
  const maxAttempts = count * 200;
  for (let attempt = 0; out.length < count; attempt++) {
    if (attempt > maxAttempts) throw new Error('scatter: zonas evitadas cobrem o anel inteiro');
    const r = Math.sqrt(minR * minR + rng() * (maxR * maxR - minR * minR));
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (avoid.some((z0) => Math.hypot(x - z0.center[0], z - z0.center[1]) < z0.radius)) continue;
    out.push([x, z]);
  }
  return out;
}
