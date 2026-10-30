import { SHAFTS, shaftFootprint, shaftPool } from './shaftLayout';

it('pegada de raio vertical fica embaixo dele', () =>
  expect(shaftFootprint({ x: 2, z: -3, tilt: 0, radius: 2, strength: 0.05 })).toEqual([2, -3]));
it('inclinação desloca a pegada em x', () =>
  expect(shaftFootprint({ x: 0, z: 0, tilt: 0.1, radius: 2, strength: 0.05 })[0]).not.toBeCloseTo(0));
it('poça máxima na pegada e some longe', () => {
  const [x, z] = shaftFootprint(SHAFTS[0]);
  expect(shaftPool(x, z)).toBeGreaterThan(shaftPool(x + 6, z));
  expect(shaftPool(200, 200)).toBeLessThan(1e-3);
});
it('poça nunca passa de 1', () => {
  for (let x = -20; x <= 20; x += 0.5) for (let z = -25; z <= 10; z += 0.5) expect(shaftPool(x, z)).toBeLessThanOrEqual(1);
});
