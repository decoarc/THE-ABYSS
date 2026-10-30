import { createRng } from '../lib/random';
import { createBoids, stepBoids, type BoidParams } from './boids';

const P: BoidParams = {
  bounds: { min: [-8, 1.5, -6], max: [8, 6, 6] },
  maxSpeed: 1.6,
  neighborRadius: 1.2,
  separation: 1.5,
  alignment: 0.6,
  cohesion: 0.4,
  burstChance: 0.01,
};

const run = (steps: number, dt = 1 / 60) => {
  const s = createBoids(100, createRng(9), P);
  const r = createRng(10);
  for (let i = 0; i < steps; i++) stepBoids(s, dt, P, r);
  return s;
};

it('ninguém foge dos limites em 2000 passos', () => {
  const s = run(2000);
  for (let i = 0; i < s.count; i++)
    for (let k = 0; k < 3; k++) {
      const v = s.pos[i * 3 + k];
      expect(v).toBeGreaterThanOrEqual(P.bounds.min[k] - 1);
      expect(v).toBeLessThanOrEqual(P.bounds.max[k] + 1);
    }
});
it('velocidade nunca passa do máximo', () => {
  const s = createBoids(100, createRng(9), P);
  const r = createRng(10);
  for (let step = 0; step < 2000; step++) {
    stepBoids(s, 1 / 60, P, r);
    for (let i = 0; i < s.count; i++) {
      const v = Math.hypot(s.vel[i * 3], s.vel[i * 3 + 1], s.vel[i * 3 + 2]);
      expect(v).toBeLessThanOrEqual(P.maxSpeed * 1.001);
    }
  }
});
it('dt grande não explode (aba em segundo plano)', () => {
  const s = createBoids(100, createRng(9), P);
  const before = Float32Array.from(s.pos);
  stepBoids(s, 5, P, createRng(1));
  expect([...s.pos].every(Number.isFinite)).toBe(true);
  for (let i = 0; i < s.pos.length; i++) expect(Math.abs(s.pos[i] - before[i])).toBeLessThan(P.maxSpeed * 0.2);
});
it('determinístico com mesma semente', () => expect(run(300).pos).toEqual(run(300).pos));
it('o cardume se agrupa (vizinhos próximos)', () => {
  const s = run(1200);
  let withNeighbor = 0;
  for (let i = 0; i < s.count; i++)
    for (let j = 0; j < s.count; j++) {
      if (i === j) continue;
      const d = Math.hypot(s.pos[i * 3] - s.pos[j * 3], s.pos[i * 3 + 1] - s.pos[j * 3 + 1], s.pos[i * 3 + 2] - s.pos[j * 3 + 2]);
      if (d < P.neighborRadius) { withNeighbor++; break; }
    }
  expect(withNeighbor / s.count).toBeGreaterThan(0.6);
});
