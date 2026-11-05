import { FLY, WORLD_ENV, constrainCamera, look, stepFreeFly, type FlyEnv, type FlyInput, type FlyState } from './freeFly';
import { edgeDepth, inward } from '../world/map';
import { seabedHeight } from './terrain';
import type { Vec3 } from '../services/wire';

const FRAME = 1 / 60;
const NONE: FlyInput = { forward: 0, right: 0, up: 0 };

/** Fundo plano em y = 0, sem borda: isola aceleração e arrasto. */
const OPEN: FlyEnv = { floor: () => 0, edgeDepth: () => 100, inward: () => [0, 0] };

const state = (pos: Vec3, yaw = 0, pitch = 0): FlyState => ({ pos: [...pos], vel: [0, 0, 0], yaw, pitch });
const speed = (s: FlyState) => Math.hypot(...s.vel);

it('acelera até maxSpeed', () => {
  const s = state([0, 5, 0]);
  for (let t = 0; t < 0.3; t += FRAME) stepFreeFly(s, { forward: 1, right: 0, up: 0 }, FRAME, OPEN);
  expect(speed(s)).toBeLessThan(FLY.maxSpeed); // inércia: não chega de uma vez
  for (let t = 0; t < 3; t += FRAME) stepFreeFly(s, { forward: 1, right: 1, up: 0 }, FRAME, OPEN);
  expect(speed(s)).toBeCloseTo(FLY.maxSpeed, 3); // diagonal não passa do limite
  // yaw 0 olha para −z; frente e direita juntas vão para +x e −z.
  expect(s.vel[0]).toBeGreaterThan(0);
  expect(s.vel[2]).toBeLessThan(0);
});

it('para sozinho em ~2 s sem entrada', () => {
  const s = state([0, 5, 0]);
  s.vel = [FLY.maxSpeed, 0, 0];
  for (let t = 0; t < 1; t += FRAME) stepFreeFly(s, NONE, FRAME, OPEN);
  expect(speed(s)).toBeGreaterThan(0.05); // desliza, não para seco
  for (let t = 1; t < 2; t += FRAME) stepFreeFly(s, NONE, FRAME, OPEN);
  expect(speed(s)).toBeLessThan(0.05);
});

it('não atravessa o chão', () => {
  const s = state([10, 4, 10], 0.4, -1.2);
  for (let t = 0; t < 5; t += FRAME) {
    stepFreeFly(s, { forward: 1, right: 0, up: -1 }, FRAME, WORLD_ENV);
    expect(s.pos[1]).toBeGreaterThanOrEqual(seabedHeight(s.pos[0], s.pos[2]) + FLY.floorClearance - 1e-9);
  }
  // desliza pelo chão em vez de parar: ainda anda na horizontal
  expect(Math.hypot(s.vel[0], s.vel[2])).toBeGreaterThan(1);
});

it('teto limita a subida', () => {
  const s = state([0, 10, 0]);
  for (let t = 0; t < 5; t += FRAME) stepFreeFly(s, { forward: 0, right: 0, up: 1 }, FRAME, WORLD_ENV);
  expect(s.pos[1]).toBeLessThanOrEqual(FLY.ceiling);
});

it('borda macia empurra de volta', () => {
  // Jardim (0, 0) r30, na borda sul: edge_depth = 1 em z = 29; yaw π olha para +z (para fora).
  const s = state([0, 4, 29], Math.PI);
  expect(edgeDepth(0, 29)).toBeCloseTo(1, 9);
  s.vel = [0, 0, FLY.maxSpeed];
  for (let t = 0; t < 5; t += FRAME) {
    stepFreeFly(s, { forward: 1, right: 0, up: 0 }, FRAME, WORLD_ENV);
    expect(edgeDepth(s.pos[0], s.pos[2])).toBeGreaterThanOrEqual(FLY.edgeHard - 1e-9);
  }
  expect(edgeDepth(s.pos[0], s.pos[2])).toBeLessThan(1); // a corrente cede, não é parede
  for (let t = 0; t < 5; t += FRAME) stepFreeFly(s, NONE, FRAME, WORLD_ENV);
  expect(edgeDepth(s.pos[0], s.pos[2])).toBeGreaterThan(0);
});

it('pitch limitado', () => {
  const s = state([0, 5, 0], 0, 3);
  stepFreeFly(s, NONE, FRAME, OPEN);
  expect(s.pitch).toBe(FLY.pitchLimit);
  look(s, 0, 10_000);
  expect(s.pitch).toBe(-FLY.pitchLimit);
  look(s, 100, 0); // arrastar para a direita vira para a direita (yaw diminui)
  expect(s.yaw).toBeCloseTo(-100 * FLY.lookRadPerPx, 9);
});

it('dt grande é limitado', () => {
  const a = state([5, 5, 5]);
  const b = state([5, 5, 5]);
  a.vel = [1, 0, 2];
  b.vel = [1, 0, 2];
  const input: FlyInput = { forward: 1, right: -1, up: 1 };
  stepFreeFly(a, input, 5, WORLD_ENV);
  stepFreeFly(b, input, FLY.maxDt, WORLD_ENV);
  expect(a).toEqual(b);
});

it('constrainCamera devolve à borda dura e acima do chão', () => {
  const p: Vec3 = [0, -10, 60]; // 30 além da borda do Jardim, embaixo do chão
  constrainCamera(p, WORLD_ENV);
  expect(edgeDepth(p[0], p[2])).toBeCloseTo(FLY.edgeHard, 6);
  expect(p[1]).toBeCloseTo(seabedHeight(p[0], p[2]) + FLY.floorClearance, 9);
  expect(inward(0, 60)).toEqual([0, -1]);
});
