import { CAMERA } from './cameraConfig';
import { followTargetBounds, stepFollow, stepReturn } from './follow';
import type { Vec3 } from '../services/wire';

const FRAME = 1 / 60;

it('followTargetBounds cobre o volume do mundo', () => {
  expect(followTargetBounds({ radius: 18, y_min: 1.5, y_max: 8 })).toEqual({
    x: [-18, 18],
    y: [1.5, 8],
    z: [-18, 18],
  });
});

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

it('stepReturn chega ao quadro herói em até 2 s', () => {
  const target: Vec3 = [4, 1, 4];
  const cam: Vec3 = [0, 8, 20];
  let arrived = false;
  for (let t = 0; t < 2 && !arrived; t += FRAME) arrived = stepReturn(target, cam, FRAME);
  expect(arrived).toBe(true);
  expect(Math.hypot(target[0] - CAMERA.target[0], target[1] - CAMERA.target[1], target[2] - CAMERA.target[2])).toBeLessThan(0.01);
  expect(Math.hypot(cam[0] - CAMERA.position[0], cam[1] - CAMERA.position[1], cam[2] - CAMERA.position[2])).toBeLessThan(0.01);
});

it('stepFollow com rate infinito encaixa no mesmo quadro (movimento reduzido)', () => {
  const target: Vec3 = [0, 0, 0];
  const cam: Vec3 = [0, 0, 10];
  stepFollow(target, cam, [5, 1, -3], FRAME, Infinity);
  expect(target).toEqual([5, 1, -3]);
  expect(cam).toEqual([5, 1, 7]);
});
