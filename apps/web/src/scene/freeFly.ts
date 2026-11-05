import type { Vec3 } from '../services/wire';
import { edgeDepth, inward } from '../world/map';
import { seabedHeight } from './terrain';

/** Ajustes da câmera livre (unidades do mundo, segundos, radianos). */
export const FLY = {
  /** Velocidade máxima nadando (u/s). */
  maxSpeed: 6,
  /** Quanto a velocidade muda por segundo rumo à desejada (u/s²). */
  accel: 8,
  /** Resistência da água sem entrada (1/s): de maxSpeed a quase parado em ~2 s. */
  drag: 2.5,
  /** Distância mínima entre a câmera e o leito. */
  floorClearance: 1.2,
  /** Altura máxima da câmera. */
  ceiling: 16,
  /** Profundidade de borda onde a corrente começa a empurrar de volta. */
  edgeSoft: 6,
  /** Profundidade de borda que a câmera nunca passa (negativa: um pouco fora do mapa). */
  edgeHard: -2,
  /** Giro do olhar por pixel arrastado. */
  lookRadPerPx: 0.0035,
  /** Limite de olhar para cima ou para baixo. */
  pitchLimit: 1.35,
  /** Maior passo de tempo aceito (aba que volta do segundo plano). */
  maxDt: 0.1,
} as const;

/** Força máxima da corrente da borda, em múltiplos de `accel`; acima de 1 para ela vencer o nado antes da borda dura. */
const EDGE_PUSH = 1.25;

/** yaw 0 olha para −z; yaw positivo gira para a esquerda (como o `rotation.y` da câmera). */
export interface FlyState {
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
}

/** Cada eixo em −1..1: frente/trás, direita/esquerda, sobe/desce. */
export interface FlyInput {
  forward: number;
  right: number;
  up: number;
}

export interface FlyEnv {
  floor(x: number, z: number): number;
  edgeDepth(x: number, z: number): number;
  inward(x: number, z: number): [number, number];
}

/** O mundo do gate E1: leito do mapa inteiro e regiões do `map-e1.json`. */
export const WORLD_ENV: FlyEnv = { floor: seabedHeight, edgeDepth, inward };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Direção do olhar (unitária) para o yaw e pitch dados. */
export function forwardOf(yaw: number, pitch: number, out: Vec3): Vec3 {
  const c = Math.cos(pitch);
  out[0] = -Math.sin(yaw) * c;
  out[1] = Math.sin(pitch);
  out[2] = -Math.cos(yaw) * c;
  return out;
}

/** Yaw e pitch de quem está em `from` olhando para `to`, escritos em `out`. */
export function aim<T extends { yaw: number; pitch: number }>(from: Vec3, to: Vec3, out: T): T {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  out.yaw = Math.atan2(-dx, -dz);
  out.pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -FLY.pitchLimit, FLY.pitchLimit);
  return out;
}

/** Aplica um arrasto do mouse ao olhar: para a direita vira à direita, para cima olha para cima. */
export function look(s: { yaw: number; pitch: number }, dxPx: number, dyPx: number): void {
  s.yaw -= dxPx * FLY.lookRadPerPx;
  s.pitch = clamp(s.pitch - dyPx * FLY.lookRadPerPx, -FLY.pitchLimit, FLY.pitchLimit);
}

export interface Constrained {
  floor: boolean;
  ceiling: boolean;
  edge: boolean;
}

/**
 * Prende a posição dentro do volume nadável: nunca além da borda dura, nunca acima do teto,
 * nunca a menos de `floorClearance` do leito (o chão vence o teto se os dois brigarem).
 * Devolve quais limites atuaram, para quem tem velocidade zerar a componente contra eles.
 */
export function constrainCamera(pos: Vec3, env: FlyEnv): Constrained {
  let edge = false;
  const depth = env.edgeDepth(pos[0], pos[2]);
  if (depth < FLY.edgeHard) {
    // Andar d rumo ao centro da região mais funda aumenta a profundidade dela em exatamente d.
    const [ix, iz] = env.inward(pos[0], pos[2]);
    const d = FLY.edgeHard - depth;
    pos[0] += ix * d;
    pos[2] += iz * d;
    edge = true;
  }
  let ceiling = false;
  if (pos[1] > FLY.ceiling) {
    pos[1] = FLY.ceiling;
    ceiling = true;
  }
  let floor = false;
  const minY = env.floor(pos[0], pos[2]) + FLY.floorClearance;
  if (pos[1] < minY) {
    pos[1] = minY;
    floor = true;
  }
  return { floor, ceiling, edge };
}

const scratchDir: Vec3 = [0, 0, 0];

/** Algum limite mexeu na posição. */
export const wasConstrained = (h: Constrained): boolean => h.floor || h.ceiling || h.edge;

/** Um passo da câmera livre: nado com inércia, resistência da água, corrente da borda e limites. */
export function stepFreeFly(s: FlyState, input: FlyInput, dt: number, env: FlyEnv): void {
  dt = clamp(dt, 0, FLY.maxDt);
  s.pitch = clamp(s.pitch, -FLY.pitchLimit, FLY.pitchLimit);
  const v = s.vel;

  // Direção desejada: frente segue o olhar (inclusive o pitch), direita é horizontal, sobe é vertical.
  const f = forwardOf(s.yaw, s.pitch, scratchDir);
  const rx = Math.cos(s.yaw);
  const rz = -Math.sin(s.yaw);
  let wx = f[0] * input.forward + rx * input.right;
  let wy = f[1] * input.forward + input.up;
  let wz = f[2] * input.forward + rz * input.right;
  const wLen = Math.hypot(wx, wy, wz);

  if (wLen > 1e-6) {
    // Com entrada: a velocidade anda rumo à desejada a no máximo `accel`.
    const k = (FLY.maxSpeed * Math.min(1, wLen)) / wLen;
    wx = wx * k - v[0];
    wy = wy * k - v[1];
    wz = wz * k - v[2];
    const diff = Math.hypot(wx, wy, wz);
    const step = Math.min(1, (FLY.accel * dt) / Math.max(diff, 1e-9));
    v[0] += wx * step;
    v[1] += wy * step;
    v[2] += wz * step;
  } else {
    // Sem entrada: a água freia aos poucos.
    const decay = Math.exp(-FLY.drag * dt);
    v[0] *= decay;
    v[1] *= decay;
    v[2] *= decay;
  }

  // Corrente da borda: começa em `edgeSoft` e cresce suave (quadrática) até a borda dura.
  const depth = env.edgeDepth(s.pos[0], s.pos[2]);
  if (depth < FLY.edgeSoft) {
    const ramp = clamp((FLY.edgeSoft - depth) / (FLY.edgeSoft - FLY.edgeHard), 0, 1);
    const push = EDGE_PUSH * FLY.accel * ramp * ramp * dt;
    const [ix, iz] = env.inward(s.pos[0], s.pos[2]);
    v[0] += ix * push;
    v[2] += iz * push;
  }

  s.pos[0] += v[0] * dt;
  s.pos[1] += v[1] * dt;
  s.pos[2] += v[2] * dt;

  // Nos limites, a componente contra eles some: desliza pelo chão e pela borda em vez de quicar.
  const hit = constrainCamera(s.pos, env);
  if (hit.floor && v[1] < 0) v[1] = 0;
  if (hit.ceiling && v[1] > 0) v[1] = 0;
  if (hit.edge) {
    const [ix, iz] = env.inward(s.pos[0], s.pos[2]);
    const out = v[0] * ix + v[2] * iz;
    if (out < 0) {
      v[0] -= ix * out;
      v[2] -= iz * out;
    }
  }
}
