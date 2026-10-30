export interface ShaftSpec {
  x: number;
  z: number;
  /** Inclinação em torno de Z, em radianos. */
  tilt: number;
  /** Raio da base do cone. */
  radius: number;
  strength: number;
}

export const SHAFT_HEIGHT = 26;
/** Altura do centro de cada cone (ele desce um pouco abaixo do leito). */
const SHAFT_CENTER_Y = SHAFT_HEIGHT / 2 - 1;
/** Força de referência: um raio com esta força produz poça de pico 1. */
const REFERENCE_STRENGTH = 0.06;

export const SHAFTS: ShaftSpec[] = [
  { x: -6, z: -9, tilt: 0.12, radius: 3.2, strength: 0.05 },
  { x: 2.5, z: -5, tilt: -0.08, radius: 2.4, strength: 0.06 },
  { x: 9, z: -14, tilt: 0.05, radius: 4, strength: 0.045 },
  { x: -1, z: -18, tilt: -0.1, radius: 3.5, strength: 0.04 },
];

/** Ponto XZ onde o eixo inclinado do raio toca y = 0. */
export function shaftFootprint(s: ShaftSpec): [number, number] {
  return [s.x + Math.tan(s.tilt) * SHAFT_CENTER_Y, s.z];
}

/** Intensidade da poça de luz no chão em (x, z): soma de gaussianas nas pegadas, saturada em 1. */
export function shaftPool(x: number, z: number): number {
  let sum = 0;
  for (const s of SHAFTS) {
    const [fx, fz] = shaftFootprint(s);
    const d2 = (x - fx) ** 2 + (z - fz) ** 2;
    sum += (s.strength / REFERENCE_STRENGTH) * Math.exp(-d2 / (2 * s.radius * s.radius));
  }
  return Math.min(1, sum);
}
