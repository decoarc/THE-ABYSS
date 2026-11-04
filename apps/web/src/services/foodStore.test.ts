import { MAP } from '../world/map';
import { createFoodStore, type FoodStore } from './foodStore';
import type { ParticleRow, TickMessage, Vec3, WorldSnapshot } from './wire';

const part = (id: number, over: Partial<Record<'y' | 'vy' | 'born' | 'life', number>> = {}): ParticleRow => [
  id, 1, over.y ?? 5, 2, 0.5, over.vy ?? -1, 0, over.born ?? 0, over.life ?? 180_000,
];

function snap(over: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    world_id: 'w', tick: 1, tick_hz: 10, server_ms: 0, map_id: 'e1', creature_scale: 0.5,
    bounds: { y_min: 1.5, y_max: 8 }, species: [], organisms: [],
    flora: [[1, 2, 0.5], [3, 4, 0.1], [5, 6, 0]],
    particles: [part(1), part(2)],
    ...over,
  };
}
const tick = (n: number, over: Partial<TickMessage> = {}): TickMessage => ({
  world_id: 'w', tick: n, server_ms: n * 100, o: [], f: [], ps: [], pr: [], ...over,
});
const ready = (): FoodStore => {
  const f = createFoodStore();
  f.applySnapshot(snap());
  return f;
};

it('snapshot define flora e partículas', () => {
  const f = ready();
  const a = f.flora();
  expect(a.length).toBe(9);
  expect([a[0], a[1], a[2], a[3], a[4], a[6], a[7], a[8]]).toEqual([1, 2, 0.5, 3, 4, 5, 6, 0]);
  expect(a[5]).toBeCloseTo(0.1, 5);
  expect([...f.particles().keys()]).toEqual([1, 2]);
  expect(f.particles().get(1)).toMatchObject({ id: 1, p0: [1, 5, 2], v: [0.5, -1, 0], bornMs: 0, lifeMs: 180_000 });
  expect(f.counts().floraSum).toBeCloseTo(0.6, 5);
  expect(f.counts().particles).toBe(2);
});

it('f atualiza só os índices citados e incrementa floraVersion', () => {
  const f = ready();
  const v0 = f.floraVersion();
  f.applyTick(tick(2, { f: [[1, 0.9]] }));
  const a = f.flora();
  expect([a[2], a[8]]).toEqual([0.5, 0]);
  expect(a[5]).toBeCloseTo(0.9, 5);
  expect(f.floraVersion()).toBeGreaterThan(v0);
  const v1 = f.floraVersion();
  f.applyTick(tick(3));
  expect(f.floraVersion()).toBe(v1);
});

it('ps acrescenta e pr remove', () => {
  const f = ready();
  f.applyTick(tick(2, { ps: [part(3)], pr: [1] }));
  expect([...f.particles().keys()]).toEqual([2, 3]);
});

it('partícula nascida e comida no mesmo tick fica ausente', () => {
  const f = ready();
  f.applyTick(tick(2, { ps: [part(3)], pr: [3] }));
  expect(f.particles().has(3)).toBe(false);
  expect(f.counts().particles).toBe(2);
});

it('ignora remoção de id desconhecido', () => {
  const f = ready();
  f.applyTick(tick(2, { pr: [99] }));
  expect(f.counts().particles).toBe(2);
});

it('ignora índice de flora fora da faixa', () => {
  const f = ready();
  const v = f.floraVersion();
  f.applyTick(tick(2, { f: [[3, 1], [-1, 1]] }));
  expect(f.flora().length).toBe(9);
  expect(f.floraVersion()).toBe(v);
});

it('ignora partícula repetida', () => {
  const f = ready();
  f.applyTick(tick(2, { ps: [part(1, { y: 7 })] }));
  expect(f.counts().particles).toBe(2);
  expect(f.particles().get(1)!.p0[1]).toBe(5);
});

it('particlePosition cai e repousa em particle_rest_y', () => {
  const f = ready();
  const p = f.particles().get(1)!;
  const out: Vec3 = [0, 0, 0];
  f.particlePosition(p, 2000, out);
  expect(out).toEqual([2, 3, 2]);
  f.particlePosition(p, 60_000, out);
  expect(out[1]).toBe(MAP.particle_rest_y);
  const rest = [...out];
  f.particlePosition(p, 120_000, out);
  expect(out).toEqual(rest);
});

it('particleAlpha vale 1 até life-30s e cai até 0', () => {
  const f = createFoodStore();
  f.applySnapshot(snap({ particles: [part(1, { born: 1000, life: 180_000 })] }));
  const p = f.particles().get(1)!;
  expect(f.particleAlpha(p, 1000 + 10_000)).toBe(1);
  expect(f.particleAlpha(p, 1000 + 165_000)).toBeCloseTo(0.5, 6);
  expect(f.particleAlpha(p, 1000 + 181_000)).toBe(0);
});

it('digestAt igual em dois stores com a mesma sequência', () => {
  const a = ready();
  const b = ready();
  for (const f of [a, b]) f.applyTick(tick(2, { f: [[0, 0.7]], ps: [part(3)], pr: [1] }));
  expect(a.digestAt(2)).toBe(b.digestAt(2));
  expect(a.digestAt(2)).toBe('2:0.80:2,3');
  expect(a.digestAt(1)).toBe('1:0.60:1,2');
  expect(a.digestAt(77)).toBeNull();
});

it('digestAt guarda só os últimos 32 ticks', () => {
  const f = ready();
  for (let n = 2; n <= 40; n++) f.applyTick(tick(n));
  expect(f.digestAt(40)).not.toBeNull();
  expect(f.digestAt(9)).not.toBeNull();
  expect(f.digestAt(8)).toBeNull();
});
