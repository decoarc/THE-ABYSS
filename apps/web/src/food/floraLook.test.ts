import { floraLook } from './floraLook';

const levels = Array.from({ length: 101 }, (_, i) => i / 100);

it('nível 0 é invisível', () => expect(floraLook(0).scale).toBe(0));
it('nível 1 tem escala 1', () => expect(floraLook(1).scale).toBe(1));

it('escala e brilho são monotônicos em 0..1', () => {
  for (let i = 1; i < levels.length; i++) {
    const a = floraLook(levels[i - 1]), b = floraLook(levels[i]);
    expect(b.scale).toBeGreaterThanOrEqual(a.scale);
    expect(b.glow).toBeGreaterThanOrEqual(a.glow);
  }
});

it('fora de 0..1 fica preso às pontas', () => {
  expect(floraLook(-0.5)).toEqual(floraLook(0));
  expect(floraLook(1.5)).toEqual(floraLook(1));
});
