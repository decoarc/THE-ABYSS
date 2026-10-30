import { createRng } from '../../lib/random';
import { generateCoral } from './coralGen';

const P = { depth: 4, branchAngle: 0.55, lengthDecay: 0.72, radius: 0.12, height: 1.4 };

it('determinístico', () => expect(generateCoral(createRng(3), P)).toEqual(generateCoral(createRng(3), P)));
it('raio nunca cresce com a profundidade', () => {
  const s = generateCoral(createRng(3), P);
  for (const a of s) for (const b of s) if (b.depth > a.depth) expect(b.radius).toBeLessThanOrEqual(a.radius);
});
it('respeita profundidade máxima', () =>
  expect(Math.max(...generateCoral(createRng(3), P).map((s) => s.depth))).toBeLessThanOrEqual(P.depth));
it('nada abaixo do chão', () => {
  for (const s of generateCoral(createRng(3), P)) expect(Math.min(s.start[1], s.end[1])).toBeGreaterThanOrEqual(0);
});
it('ramifica de fato', () => expect(generateCoral(createRng(3), P).length).toBeGreaterThan(P.depth * 2));
