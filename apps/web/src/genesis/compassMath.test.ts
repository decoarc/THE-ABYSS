import { expect, test } from 'vitest';
import { INITIAL_BLUEPRINT, bodyRadius } from './blueprint';
import type { Blueprint } from '../services/wire';
import { compassLayout, fitDistance } from './compassMath';

const longo: Blueprint = {
  ...INITIAL_BLUEPRINT,
  body: { spine: [[-1.6, -0.4, 0.3], [-0.5, 0.2, 0.5], [0.6, 0.5, 0.4], [1.8, 0, 0.2]] },
};

test('o chão fica abaixo do ponto mais baixo do corpo, já no espaço centrado', () => {
  for (const bp of [INITIAL_BLUEPRINT, longo]) {
    const c = compassLayout(bp);
    const cy = bp.body.spine.reduce((m, p) => m + p[1], 0) / bp.body.spine.length;
    const lowest = Math.min(...bp.body.spine.map(([, y, r]) => y - r)) - cy;
    expect(c.z).toBeLessThanOrEqual(lowest - 0.2);
  }
});

test('o anel envolve o corpo e a frente aponta para +Y', () => {
  const c = compassLayout(longo);
  expect(c.radius).toBeGreaterThan(bodyRadius(longo));
  expect(c.forward).toBe(Math.PI / 2);
});

test('corpo maior pede câmera mais longe', () => {
  expect(fitDistance(longo, 38)).toBeGreaterThan(fitDistance(INITIAL_BLUEPRINT, 38));
  expect(fitDistance(INITIAL_BLUEPRINT, 38)).toBeGreaterThan(bodyRadius(INITIAL_BLUEPRINT));
});
