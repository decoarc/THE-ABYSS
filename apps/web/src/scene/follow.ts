import type { Vec3 } from '../services/wire';
import { CAMERA } from './cameraConfig';

/** Quão rápido o alvo alcança o organismo ao seguir (1/s). */
export const FOLLOW_RATE = 2.5;
/** Taxa que reduz a distância ao quadro herói a 1/1000 em `CAMERA.returnSeconds`. */
const RETURN_RATE = Math.log(1000) / CAMERA.returnSeconds;
/** Abaixo desta distância (unidades) a câmera considera que chegou ao quadro herói. */
const ARRIVED_DISTANCE = 0.01;

/** Fração do caminho andada neste quadro. Taxa infinita encaixa de uma vez. */
function fraction(rate: number, dt: number): number {
  return Number.isFinite(rate) ? 1 - Math.exp(-rate * dt) : 1;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Caixa de alvo que cobre todo o volume do mundo, para o "Seguir" poder acompanhar em qualquer ponto. */
export function followTargetBounds(b: { radius: number; y_min: number; y_max: number }): {
  x: [number, number];
  y: [number, number];
  z: [number, number];
} {
  return { x: [-b.radius, b.radius], y: [b.y_min, b.y_max], z: [-b.radius, b.radius] };
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

/** Aproxima alvo e câmera do quadro herói. Devolve true quando os dois chegaram. */
export function stepReturn(target: Vec3, cam: Vec3, dt: number, rate = RETURN_RATE): boolean {
  const f = fraction(rate, dt);
  for (let i = 0; i < 3; i++) {
    target[i] += (CAMERA.target[i] - target[i]) * f;
    cam[i] += (CAMERA.position[i] - cam[i]) * f;
  }
  return distance(target, CAMERA.target) < ARRIVED_DISTANCE && distance(cam, CAMERA.position) < ARRIVED_DISTANCE;
}
