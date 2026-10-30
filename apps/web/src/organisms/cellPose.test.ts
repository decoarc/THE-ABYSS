import { cellPose } from './cellPose';
import { CELULA } from './creatureConfig';

it('fica entre as pontas', () => {
  for (let t = 0; t < 200; t += 0.37) {
    const { position: p } = cellPose(t, CELULA);
    for (let k = 0; k < 3; k++) {
      expect(p[k]).toBeGreaterThanOrEqual(Math.min(CELULA.from[k], CELULA.to[k]) - 1e-6);
      expect(p[k]).toBeLessThanOrEqual(Math.max(CELULA.from[k], CELULA.to[k]) + 1e-6);
    }
  }
});
it('heading unitário', () => {
  for (let t = 0; t < 60; t += 0.5) expect(Math.hypot(...cellPose(t, CELULA).heading)).toBeCloseTo(1, 5);
});
it('não salta: velocidade limitada', () => {
  for (let t = 0; t < 60; t += 0.05) {
    const a = cellPose(t, CELULA).position, b = cellPose(t + 0.05, CELULA).position;
    expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.05).toBeLessThanOrEqual(CELULA.speed * 1.05);
  }
});
it('heading não salta na virada', () => {
  for (let t = 0; t < 60; t += 0.05) {
    const a = cellPose(t, CELULA).heading, b = cellPose(t + 0.05, CELULA).heading;
    expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])).toBeLessThan(0.2);
  }
});
it('t muito grande continua finito', () => expect(cellPose(1e6, CELULA).position.every(Number.isFinite)).toBe(true));
it('chega perto das duas pontas', () => {
  let nearFrom = false, nearTo = false;
  for (let t = 0; t < 120; t += 0.1) {
    const p = cellPose(t, CELULA).position;
    if (Math.hypot(p[0] - CELULA.from[0], p[1] - CELULA.from[1], p[2] - CELULA.from[2]) < 0.1) nearFrom = true;
    if (Math.hypot(p[0] - CELULA.to[0], p[1] - CELULA.to[1], p[2] - CELULA.to[2]) < 0.1) nearTo = true;
  }
  expect(nearFrom && nearTo).toBe(true);
});
