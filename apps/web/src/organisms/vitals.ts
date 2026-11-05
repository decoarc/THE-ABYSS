import { DISSOLVE_MS, type Vitals } from '../services/worldStore';

/** Ajustes visuais do ciclo de vida: tudo que se calibra no olho fica aqui. */
export const GLOW_MIN = 0.35;
export const GLOW_SPAN = 0.65;
/** Abaixo desta energia o brilho tremeluz. */
export const FLICKER_BELOW = 0.25;
export const FLICKER_PERIOD_S = 2.4;
/** O tremeluzir oscila entre FLICKER_FLOOR e 1 do brilho base. */
export const FLICKER_FLOOR = 0.6;
/** Quanto leva, depois de amadurecer, para o jovem chegar ao tamanho adulto. */
export const GROW_MS = 4000;
export const STRETCH_MAX = 1.8;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Brilho do núcleo: 1 com energia cheia; abaixo de FLICKER_BELOW, tremeluz. `t` em segundos. */
export function energyGlow(energy: number, t: number): number {
  const e = clamp01(energy);
  const base = GLOW_MIN + GLOW_SPAN * e;
  if (e >= FLICKER_BELOW) return base;
  const s = Math.sin((Math.PI * t) / FLICKER_PERIOD_S);
  return base * (FLICKER_FLOOR + (1 - FLICKER_FLOOR) * s * s);
}

/** Escala de vida: jovem pequeno, crescendo suave (smoothstep) por GROW_MS depois de amadurecer. */
export function lifeScale(v: Vitals, nowMs: number, juvenileScale: number): number {
  if (v.juvenile) return juvenileScale;
  if (v.maturedAtMs === null) return 1;
  const k = clamp01((nowMs - v.maturedAtMs) / GROW_MS);
  if (k >= 1) return 1;
  return juvenileScale + (1 - juvenileScale) * k * k * (3 - 2 * k);
}

/** Alongamento no eixo da velocidade: 1 -> STRETCH_MAX ao longo de `divideS` desde que a divisão começou. */
export function stretch(v: Vitals, nowMs: number, divideS: number): number {
  if (!v.dividing || v.dividingSinceMs === null) return 1;
  const k = clamp01((nowMs - v.dividingSinceMs) / (divideS * 1000));
  return 1 + (STRETCH_MAX - 1) * k;
}

/** Opacidade/brilho do corpo: 1 -> 0 em DISSOLVE_MS depois da morte; 1 para os vivos. */
export function dissolve(v: Vitals, nowMs: number): number {
  if (v.dyingSinceMs === null) return 1;
  return 1 - clamp01((nowMs - v.dyingSinceMs) / DISSOLVE_MS);
}
