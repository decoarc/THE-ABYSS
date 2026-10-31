import type { Vec3 } from '../services/wire';
import { createTrail } from './trail';

const out = (): Vec3 => [0, 0, 0];

it('interpola linearmente entre amostras', () => {
  const t = createTrail(8);
  t.push(0, [0, 0, 0]);
  t.push(100, [1, 2, -1]);
  const p = t.at(50, out());
  expect(p[0]).toBeCloseTo(0.5);
  expect(p[1]).toBeCloseTo(1);
  expect(p[2]).toBeCloseTo(-0.5);
});
it('antes do ponto mais antigo, limita a ele', () => {
  const t = createTrail(8);
  t.push(0, [0, 0, 0]);
  t.push(100, [1, 0, 0]);
  expect(t.at(-500, out())[0]).toBe(0);
});
it('depois do ponto mais novo, limita a ele', () => {
  const t = createTrail(8);
  t.push(0, [0, 0, 0]);
  t.push(100, [1, 0, 0]);
  expect(t.at(900, out())[0]).toBe(1);
});
it('respeita a capacidade: descarta os mais antigos', () => {
  const t = createTrail(3);
  for (let i = 0; i < 6; i++) t.push(i * 100, [i, 0, 0]);
  // Restam t=300, 400, 500.
  expect(t.at(0, out())[0]).toBe(3);
  expect(t.at(350, out())[0]).toBeCloseTo(3.5);
});
it('vazio devolve a origem sem quebrar', () => {
  expect(createTrail(4).at(10, [9, 9, 9])).toEqual([0, 0, 0]);
});
