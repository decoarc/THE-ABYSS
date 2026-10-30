import { createRng } from '../../lib/random';
import { VENTS, scatter } from './layout';

it('exatamente uma chaminé herói na origem', () => {
  const h = VENTS.filter((v) => v.hero);
  expect(h).toHaveLength(1);
  expect(h[0].position[0]).toBe(0);
  expect(h[0].position[2]).toBe(0);
});
it('3 a 4 chaminés', () => {
  expect(VENTS.length).toBeGreaterThanOrEqual(3);
  expect(VENTS.length).toBeLessThanOrEqual(4);
});
it('chaminés secundárias a menos de 6 unidades da herói', () => {
  for (const v of VENTS) expect(Math.hypot(v.position[0], v.position[2])).toBeLessThan(6);
});
it('scatter respeita anel e zonas evitadas', () => {
  const pts = scatter(createRng(1), 500, { minR: 3, maxR: 40, avoid: [{ center: [0, 0], radius: 5 }] });
  expect(pts).toHaveLength(500);
  for (const [x, z] of pts) {
    const r = Math.hypot(x, z);
    expect(r).toBeGreaterThanOrEqual(5);
    expect(r).toBeLessThanOrEqual(40);
  }
});
