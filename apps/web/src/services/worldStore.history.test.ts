import { createWorldStore } from './worldStore';
import type { TickMessage, WorldSnapshot } from './wire';

const SERVER0 = 1_000_000;

function snap(): WorldSnapshot {
  return {
    world_id: 'w1', tick: 1, tick_hz: 10, server_ms: SERVER0,
    map_id: 'e1', creature_scale: 0.5, juvenile_scale: 0.45, divide_s: 2,
    bounds: { y_min: 1.5, y_max: 8 },
    species: [{ id: 'membrana', code: 'MBR', name: 'Membrana', body_radius: 1.1, diet: { kind: 'particles', prey: [] }, extinct_ms: null }],
    organisms: [
      { id: 'MBR-0001', species: 'membrana', born_ms: 0, p: [1, 2, 3], v: [0, 0, 0], e: 0.8, stage: 'adult', dividing: false, gen: 1, parent: null },
      { id: 'MBR-0002', species: 'membrana', born_ms: 0, p: [4, 5, 6], v: [0, 0, 0], e: 0.8, stage: 'adult', dividing: false, gen: 1, parent: null },
    ],
    flora: [], particles: [],
  };
}

const tick = (n: number, x: number): TickMessage => ({
  world_id: 'w1', tick: n, server_ms: SERVER0 + n * 100,
  o: [[x, 0, 0, 0, 0, 0, 0.8, 0], [x + 1, 0, 0, 0, 0, 0, 0.8, 0]],
  b: [], d: [], x: [], f: [], sp: [], ps: [], pr: [],
});

it('positionsAt devolve as posições do snapshot e dos ticks seguintes', () => {
  const store = createWorldStore();
  store.applySnapshot(snap(), SERVER0);
  store.applyTick(tick(2, 10), SERVER0 + 200);
  expect(store.positionsAt(1)).toEqual({ 'MBR-0001': [1, 2, 3], 'MBR-0002': [4, 5, 6] });
  expect(store.positionsAt(2)).toEqual({ 'MBR-0001': [10, 0, 0], 'MBR-0002': [11, 0, 0] });
});

it('positionsAt devolve null para um tick fora do histórico', () => {
  const store = createWorldStore();
  store.applySnapshot(snap(), SERVER0);
  expect(store.positionsAt(99)).toBeNull();
});

it('lastTick acompanha o último tick aplicado', () => {
  const store = createWorldStore();
  store.applySnapshot(snap(), SERVER0);
  expect(store.lastTick()).toBe(1);
  store.applyTick(tick(2, 0), SERVER0 + 200);
  expect(store.lastTick()).toBe(2);
});
