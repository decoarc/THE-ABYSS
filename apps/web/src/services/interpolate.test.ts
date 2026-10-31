import { hermite } from './interpolate';
import type { Vec3 } from './wire';

it('hermite com velocidade coerente é linear', () => {
  const out: Vec3 = [0, 0, 0];
  hermite([0, 0, 0], [1, 0, 0], 0, [0.1, 0, 0], [1, 0, 0], 100, 50, out);
  expect(out[0]).toBeCloseTo(0.05, 6);
});

it('acerta as pontas', () => {
  const out: Vec3 = [0, 0, 0];
  const p0: Vec3 = [1, 2, 3], p1: Vec3 = [4, 5, 6];
  hermite(p0, [0.3, 0, 0], 10, p1, [0, 0.2, 0], 110, 10, out);
  expect(out).toEqual(p0);
  hermite(p0, [0.3, 0, 0], 10, p1, [0, 0.2, 0], 110, 110, out);
  expect(out[0]).toBeCloseTo(4, 9);
  expect(out[1]).toBeCloseTo(5, 9);
  expect(out[2]).toBeCloseTo(6, 9);
});
