import { pickNearest, type GlowRequest } from './creatureGlow';

const req = (id: string, x: number, y = 0, z = 0): GlowRequest => ({
  id, color: [1, 1, 1], x, y, z, radius: 2, intensity: 1,
});

it('devolve os n mais próximos, em ordem', () => {
  const reqs = [req('a', 9), req('b', 1), req('c', -3), req('d', 0, 0, 2), req('e', 20)];
  expect(pickNearest(reqs, [0, 0, 0], 3).map((r) => r.id)).toEqual(['b', 'd', 'c']);
});
it('mede a distância ao alvo, não à origem', () => {
  const reqs = [req('a', 0), req('b', 10)];
  expect(pickNearest(reqs, [9, 0, 0], 1).map((r) => r.id)).toEqual(['b']);
});
it('com n maior que a quantidade, devolve todos', () => {
  const reqs = [req('a', 5), req('b', 1)];
  expect(pickNearest(reqs, [0, 0, 0], 5).map((r) => r.id)).toEqual(['b', 'a']);
});
it('não altera a lista recebida', () => {
  const reqs = [req('a', 5), req('b', 1)];
  pickNearest(reqs, [0, 0, 0], 1);
  expect(reqs.map((r) => r.id)).toEqual(['a', 'b']);
});
