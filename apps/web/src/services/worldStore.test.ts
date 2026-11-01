import { BUFFER_SAMPLES, createWorldStore, MAX_EXTRAPOLATE_MS } from './worldStore';
import type { TickMessage, Vec3, WorldSnapshot } from './wire';

const SERVER0 = 1_000_000;

function snap(over: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    world_id: 'w1', tick: 1, tick_hz: 10, server_ms: SERVER0,
    map_id: 'e1', creature_scale: 0.5,
    bounds: { y_min: 1.5, y_max: 8 },
    species: [{ id: 'membrana', code: 'MBR', name: 'Membrana', body_radius: 1.1 }],
    organisms: [{ id: 'MBR-0001', species: 'membrana', born_ms: 0, p: [0, 0, 0], v: [1, 0, 0] }],
    ...over,
  };
}
const tick = (n: number, x: number, over: Partial<TickMessage> = {}): TickMessage => ({
  world_id: 'w1', tick: n, server_ms: SERVER0 + (n - 1) * 100, o: [[x, 0, 0, 1, 0, 0]], ...over,
});
// Mensagem com latência fixa de 5 ms: local = server_ms + 5.
const L = (serverMs: number) => serverMs + 5;
const P = (): [Vec3, Vec3] => [[0, 0, 0], [0, 0, 0]];

function ready() {
  const s = createWorldStore();
  s.applySnapshot(snap(), L(SERVER0));
  return s;
}

it('snapshot define roster e espécies', () => {
  const s = ready();
  expect(s.roster()).toHaveLength(1);
  expect(s.species()[0].code).toBe('MBR');
  expect(s.worldId()).toBe('w1');
  expect(s.bounds()).toEqual({ y_min: 1.5, y_max: 8 });
});

it('interpola entre ticks com atraso de renderização', () => {
  const s = ready(); // x=0 em t=0 (tick 1)
  expect(s.applyTick(tick(2, 0.1), L(SERVER0 + 100))).toBe('ok'); // x=0.1 em t=100
  const [p, v] = P();
  expect(s.sample('MBR-0001', L(SERVER0 + 100) + 150, p, v)).toBe(true);
  expect(p[0]).toBeCloseTo(0.05, 6);
});

it('ignora tick velho', () => {
  const s = ready();
  s.applyTick(tick(2, 0.1), L(SERVER0 + 100));
  const [p, v] = P();
  s.sample('MBR-0001', L(SERVER0 + 100) + 150, p, v);
  const before = p[0];
  expect(s.applyTick(tick(2, 5), L(SERVER0 + 100))).toBe('stale');
  expect(s.applyTick(tick(1, 5), L(SERVER0 + 100))).toBe('stale');
  s.sample('MBR-0001', L(SERVER0 + 100) + 150, p, v);
  expect(p[0]).toBe(before);
});

it('world_id diferente pede resync', () => {
  expect(ready().applyTick(tick(2, 0, { world_id: 'outro' }), 0)).toBe('resync');
});

it('contagem diferente do roster pede resync', () => {
  expect(ready().applyTick(tick(2, 0, { o: [] }), 0)).toBe('resync');
});

it('clamps extrapolation', () => {
  const s = ready();
  s.applyTick(tick(2, 0.1), L(SERVER0 + 100));
  const [p, v] = P();
  const [q, w] = P();
  // última amostra t=100; render = local - 5 - 200
  s.sample('MBR-0001', L(SERVER0 + 100 + 200 + MAX_EXTRAPOLATE_MS), p, v);
  s.sample('MBR-0001', L(SERVER0 + 100) + 5000, q, w);
  expect(p[0]).toBeCloseTo(0.1 + MAX_EXTRAPOLATE_MS / 1000, 6);
  expect(q[0]).toBeCloseTo(p[0], 9);
});

it('bounded buffer', () => {
  const s = ready();
  for (let n = 2; n <= 1000; n++) s.applyTick(tick(n, n / 10), L(SERVER0 + (n - 1) * 100));
  expect(s.debugBufferSize('MBR-0001')).toBeLessThanOrEqual(BUFFER_SAMPLES);
  const [p, v] = P();
  s.sample('MBR-0001', L(SERVER0 + 999 * 100) + 50, p, v);
  // último tick (1000) em t=99900; render = t + 50 - 200 = 99750: meio entre x=99.8 e x=99.9
  expect(p[0]).toBeCloseTo(99.85, 3);
});

it('sample returns false for unknown id', () => {
  const [p, v] = P();
  expect(ready().sample('nope', 0, p, v)).toBe(false);
});

it('subscribe não dispara por tick', () => {
  const s = createWorldStore();
  const fn = vi.fn();
  s.subscribe(fn);
  s.applySnapshot(snap(), L(SERVER0));
  expect(fn).toHaveBeenCalledTimes(1);
  s.setStatus('live');
  expect(fn).toHaveBeenCalledTimes(2);
  s.applyTick(tick(2, 0.1), L(SERVER0 + 100));
  expect(fn).toHaveBeenCalledTimes(2);
});

it('serverNow usa o menor atraso observado', () => {
  const s = createWorldStore();
  s.applySnapshot(snap(), SERVER0 + 40);
  s.applyTick(tick(2, 0.1), SERVER0 + 100 + 10);
  s.applyTick(tick(3, 0.2), SERVER0 + 200 + 30);
  expect(s.serverNow(SERVER0 + 1000)).toBe(SERVER0 + 990);
});

it('creatureScale lê o snapshot (1 antes dele)', () => {
  const s = createWorldStore();
  expect(s.creatureScale()).toBe(1);
  s.applySnapshot(snap({ creature_scale: 0.25 }), L(SERVER0));
  expect(s.creatureScale()).toBe(0.25);
});
