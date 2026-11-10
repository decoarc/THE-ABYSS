// Bússola no chão da prévia: parte pura (medidas), sem three. O espaço é o da prévia: criatura
// centrada no centróide da espinha, +z para cima, frente = +y local (a mesma de Criada no mundo).
import { bodyRadius } from './blueprint';
import type { Blueprint } from '../services/wire';

const FLOOR_GAP = 0.25;
const RING_GAP = 0.3;

export interface CompassLayout {
  /** Raio do anel, maior que a extensão horizontal do corpo. */
  radius: number;
  /** Altura (z) do chão, abaixo do ponto mais baixo do corpo desenhado. */
  z: number;
  /** Ângulo da frente no plano do chão, a partir de +x, em radianos (+y → π/2). */
  forward: number;
}

export function compassLayout(bp: Blueprint): CompassLayout {
  const s = bp.body.spine;
  const cx = s.reduce((m, p) => m + p[0], 0) / s.length;
  const cy = s.reduce((m, p) => m + p[1], 0) / s.length;
  let reach = 0;
  let low = Infinity;
  for (const [x, y, r] of s) {
    reach = Math.max(reach, Math.abs(x - cx) + r);
    low = Math.min(low, y - cy - r);
  }
  return { radius: Math.max(reach, 0.6) + RING_GAP, z: low - FLOOR_GAP, forward: Math.PI / 2 };
}

/** Distância inicial da câmera para a esfera do corpo (e do anel) caber no campo de visão, com folga. */
export function fitDistance(bp: Blueprint, fovDeg: number, margin = 1.25): number {
  const r = Math.max(bodyRadius(bp), compassLayout(bp).radius * 1.05);
  return (r / Math.sin((fovDeg * Math.PI) / 360)) * margin;
}
