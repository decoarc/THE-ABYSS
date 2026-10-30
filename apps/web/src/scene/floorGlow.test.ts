import { MAX_FLOOR_GLOWS, createFloorGlowStore, setCreatureGlow, type FloorGlow } from './floorGlow';

const G: FloorGlow = { x: 0, z: 0, radius: 1, color: [1, 1, 1], intensity: 1 };
const buffers = () => [new Float32Array(MAX_FLOOR_GLOWS * 4), new Float32Array(MAX_FLOOR_GLOWS * 3)] as const;

it('pack devolve só os slots ativos', () => {
  const s = createFloorGlowStore();
  s.set(0, G);
  s.set(3, G);
  expect(s.pack(...buffers())).toBe(2);
});
it('slot fora do intervalo é ignorado', () => {
  const s = createFloorGlowStore();
  s.set(MAX_FLOOR_GLOWS, G);
  s.set(-1, G);
  expect(s.pack(...buffers())).toBe(0);
});
it('clear libera o slot', () => {
  const s = createFloorGlowStore();
  s.set(2, G);
  s.clear(2);
  expect(s.pack(...buffers())).toBe(0);
});
it('pack escreve posição e cor', () => {
  const s = createFloorGlowStore();
  s.set(5, { x: 1, z: 2, radius: 3, color: [0.1, 0.2, 0.3], intensity: 0.5 });
  const [p, c] = buffers();
  s.pack(p, c);
  expect([...p.slice(0, 4)]).toEqual([1, 2, 3, 0.5]);
  expect([...c.slice(0, 3)].map((v) => +v.toFixed(3))).toEqual([0.1, 0.2, 0.3]);
});

it('criatura mais alta tinge o chão mais fraco', () => {
  const s = createFloorGlowStore();
  const [p, c] = buffers();
  setCreatureGlow(0, [1, 1, 1], 0, 2, 0, 1, s);
  setCreatureGlow(1, [1, 1, 1], 0, 6, 0, 1, s);
  s.pack(p, c);
  expect(p[3]).toBeGreaterThan(p[7]);
});
it('criatura muito alta não tinge o chão', () => {
  const s = createFloorGlowStore();
  const [p, c] = buffers();
  setCreatureGlow(0, [1, 1, 1], 0, 40, 0, 1, s);
  s.pack(p, c);
  expect(p[3]).toBe(0);
});
