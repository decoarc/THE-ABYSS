import type { Vec3 } from '../services/wire';

/** Quão rápido o alvo alcança o organismo ao seguir (1/s). */
export const FOLLOW_RATE = 2.5;

/** Fração do caminho andada neste quadro. Taxa infinita encaixa de uma vez. */
function fraction(rate: number, dt: number): number {
  return Number.isFinite(rate) ? 1 - Math.exp(-rate * dt) : 1;
}

/** Move o alvo na direção do organismo e leva a câmera pelo mesmo deslocamento (enquadramento preservado). */
export function stepFollow(target: Vec3, cam: Vec3, org: Vec3, dt: number, rate = FOLLOW_RATE): void {
  const f = fraction(rate, dt);
  for (let i = 0; i < 3; i++) {
    const d = (org[i] - target[i]) * f;
    target[i] += d;
    cam[i] += d;
  }
}
