import { createSelection } from './selection';
import { clearIfGone } from './selectionSync';
import { createWorldStore } from './worldStore';
import type { WorldSnapshot } from './wire';

function snap(ids: string[]): WorldSnapshot {
  return {
    world_id: 'w1', tick: 1, tick_hz: 10, server_ms: 1000,
    bounds: { radius: 18, y_min: 1.5, y_max: 8 },
    species: [{ id: 'membrana', code: 'MBR', name: 'Membrana', body_radius: 1.1 }],
    organisms: ids.map((id) => ({ id, species: 'membrana', born_ms: 0, p: [0, 0, 0], v: [0, 0, 0] })),
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
