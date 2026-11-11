import { expect, test } from 'vitest';
import { INITIAL_BLUEPRINT, bodyRadius } from './blueprint';
import type { Blueprint } from '../services/wire';
import { compassLayout, compassOffset, fitDistance } from './compassMath';

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

test('o anel envolve o corpo', () => {
  const c = compassLayout(longo);
  expect(c.radius).toBeGreaterThan(bodyRadius(longo));
});

test('corpo maior pede câmera mais longe', () => {
  expect(fitDistance(longo, 38)).toBeGreaterThan(fitDistance(INITIAL_BLUEPRINT, 38));
  expect(fitDistance(INITIAL_BLUEPRINT, 38)).toBeGreaterThan(bodyRadius(INITIAL_BLUEPRINT));
});

test('a bússola acompanha o corpo: zero sem arrasto, e o deslocamento da espinha durante ele', () => {
  const cy = (-1.6 - 0.5 + 0.6 + 1.8) / 4;
  const cz = (-0.4 + 0.2 + 0.5 + 0) / 4;
  expect(compassOffset(longo, { y: cy, z: cz })).toEqual([0, 0, 0]);
  const o = compassOffset(longo, { y: cy - 0.5, z: cz + 0.25 });
  expect(o[1]).toBeCloseTo(0.5);
  expect(o[2]).toBeCloseTo(-0.25);
});
