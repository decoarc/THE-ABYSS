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
  return { radius: Math.max(reach, 0.6) + RING_GAP, z: low - FLOOR_GAP };
}

/**
 * Deslocamento da bússola no espaço da prévia: o corpo é desenhado em centróide(bp) − vista; sem arrasto
 * a vista é o próprio centróide (deslocamento zero), no arrasto ela fica congelada e o corpo anda.
 * Eixos da cena: x fica, y = x da espinha, z = y da espinha.
 */
export function compassOffset(bp: Blueprint, view: { y: number; z: number }): [number, number, number] {
  const s = bp.body.spine;
  const cy = s.reduce((m, p) => m + p[0], 0) / s.length;
  const cz = s.reduce((m, p) => m + p[1], 0) / s.length;
  return [0, cy - view.y, cz - view.z];
}

/** Distância inicial da câmera para a esfera do corpo (e do anel) caber no campo de visão, com folga. */
export function fitDistance(bp: Blueprint, fovDeg: number, margin = 1.25): number {
  const r = Math.max(bodyRadius(bp), compassLayout(bp).radius * 1.05);
  return (r / Math.sin((fovDeg * Math.PI) / 360)) * margin;
}
