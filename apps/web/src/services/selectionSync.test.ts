import { createSelection } from './selection';
import { clearIfGone } from './selectionSync';
import { createWorldStore } from './worldStore';
import type { DeathCause, TickMessage, TickRow, WorldSnapshot } from './wire';

function snap(ids: string[]): WorldSnapshot {
  return {
    world_id: 'w1', tick: 1, tick_hz: 10, server_ms: 1000,
    map_id: 'e1', creature_scale: 0.5, juvenile_scale: 0.45, divide_s: 2,
    bounds: { y_min: 1.5, y_max: 8 },
    species: [{ id: 'membrana', code: 'MBR', name: 'Membrana', body_radius: 1.1, diet: { kind: 'particles', prey: [] }, extinct_ms: null }],
    organisms: ids.map((id) => ({ id, species: 'membrana', born_ms: 0, p: [0, 0, 0], v: [0, 0, 0], e: 0.8, stage: 'adult', dividing: false, gen: 1, parent: null })),
    flora: [], particles: [],
  };
}

it('clears selection when id leaves roster', () => {
  const store = createWorldStore();
  const selection = createSelection();
  store.applySnapshot(snap(['MBR-0003', 'MBR-0004']), 1005);
  selection.select('MBR-0003');
  selection.setFollowing(true);

  store.applySnapshot(snap(['MBR-0004']), 2005);
  clearIfGone(store, selection);

  expect(selection.get()).toEqual({ id: null, following: false });
});

it('keeps selection when id is still in roster', () => {
  const store = createWorldStore();
  const selection = createSelection();
  store.applySnapshot(snap(['MBR-0003']), 1005);
  selection.select('MBR-0003');
  selection.setFollowing(true);

  clearIfGone(store, selection);

  expect(selection.get()).toEqual({ id: 'MBR-0003', following: true });
});

it('nothing to do without selection', () => {
  const store = createWorldStore();
  const selection = createSelection();
  store.applySnapshot(snap([]), 1005);
  clearIfGone(store, selection);
  expect(selection.get()).toEqual({ id: null, following: false });
});

function tick(n: number, o: TickRow[], d: [string, DeathCause][]): TickMessage {
  return { world_id: 'w1', tick: n, server_ms: 1000 + (n - 1) * 100, o, b: [], d, x: [], f: [], ps: [], pr: [] };
}
const ROW: TickRow = [0, 0, 0, 0, 0, 0, 0.1, 0];

it('seleção sobrevive ao fantasma: solta o Seguir na morte e limpa quando ele sai', () => {
  const store = createWorldStore();
  const selection = createSelection();
  store.subscribe(() => clearIfGone(store, selection));
  store.applySnapshot(snap(['MBR-0003', 'MBR-0004']), 1005);
  selection.select('MBR-0003');
  selection.setFollowing(true);

  store.applyTick(tick(2, [ROW], [['MBR-0003', 'starvation']]), 1105);
  expect(selection.get()).toEqual({ id: 'MBR-0003', following: false });

  let n = 3;
  while (selection.get().id !== null && n < 40) {
    store.applyTick(tick(n, [ROW], []), 1005 + (n - 1) * 100);
    n++;
  }
  expect(selection.get()).toEqual({ id: null, following: false });
  expect(n).toBeGreaterThan(10);
});

it('predação solta na hora', () => {
  const store = createWorldStore();
  const selection = createSelection();
  store.subscribe(() => clearIfGone(store, selection));
  store.applySnapshot(snap(['MBR-0003', 'MBR-0004']), 1005);
  selection.select('MBR-0003');
  selection.setFollowing(true);
  store.applyTick(tick(2, [ROW], [['MBR-0003', 'predation']]), 1105);
  expect(selection.get()).toEqual({ id: null, following: false });
});
