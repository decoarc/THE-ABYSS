import { stepFollow } from './follow';
import { FLY, WORLD_ENV, constrainCamera } from './freeFly';
import { seabedHeight } from './terrain';
import type { Vec3 } from '../services/wire';

const FRAME = 1 / 60;

it('stepFollow preserva o deslocamento câmera–alvo', () => {
  const target: Vec3 = [0, 0, 0];
  const cam: Vec3 = [1, 2, 3];
  stepFollow(target, cam, [5, 0, -2], 0.1);
  expect(cam[0] - target[0]).toBeCloseTo(1, 9);
  expect(cam[1] - target[1]).toBeCloseTo(2, 9);
  expect(cam[2] - target[2]).toBeCloseTo(3, 9);
  expect(target[0]).not.toBe(0);
});

it('stepFollow converge para um organismo parado', () => {
  const target: Vec3 = [0, 0, 0];
  const cam: Vec3 = [0, 0, 10];
  const org: Vec3 = [5, 1, -3];
  for (let t = 0; t < 5; t += FRAME) stepFollow(target, cam, org, FRAME);
  const dist = Math.hypot(target[0] - org[0], target[1] - org[1], target[2] - org[2]);
  expect(dist).toBeLessThan(0.01);
});

it('follow respeita o chão', () => {
  // Da Floresta à Planície (~100 unidades), com o deslocamento câmera–alvo apontando para baixo.
  const target: Vec3 = [-45, 2, -30];
  const cam: Vec3 = [-45, 1, -24];
  const org: Vec3 = [55, 1.5, -28];
  for (let t = 0; t < 10; t += FRAME) {
    stepFollow(target, cam, org, FRAME);
    constrainCamera(cam, WORLD_ENV);
    expect(cam[1]).toBeGreaterThanOrEqual(seabedHeight(cam[0], cam[2]) + FLY.floorClearance - 1e-9);
  }
  expect(Math.hypot(target[0] - org[0], target[2] - org[2])).toBeLessThan(0.01);
});

it('stepFollow com rate infinito encaixa no mesmo quadro (movimento reduzido)', () => {
  const target: Vec3 = [0, 0, 0];
  const cam: Vec3 = [0, 0, 10];
  stepFollow(target, cam, [5, 1, -3], FRAME, Infinity);
  expect(target).toEqual([5, 1, -3]);
  expect(cam).toEqual([5, 1, 7]);
});
