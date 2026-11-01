import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { WorldContext } from '../services/WorldProvider';
import { createSelection, type Selection } from '../services/selection';
import { createWorldStore, type WorldStore } from '../services/worldStore';
import type { OrganismInfo, SpeciesInfo, WorldSnapshot } from '../services/wire';

export const SPECIES: SpeciesInfo[] = [
  { id: 'membrana', code: 'MBR', name: 'Membrana', body_radius: 1.1 },
  { id: 'celula', code: 'CEL', name: 'Célula', body_radius: 0.8 },
];

/** Renderiza `ui` dentro de um mundo de teste: store alimentada por snapshot, sem socket. */
export function renderWithWorld(
  ui: ReactElement,
  options: { organisms?: OrganismInfo[]; live?: boolean; selectId?: string; following?: boolean } = {},
) {
  const store: WorldStore = createWorldStore();
  const selection: Selection = createSelection();
  const snapshot: WorldSnapshot = {
    world_id: 'w1', tick: 1, tick_hz: 10, server_ms: 1_000_000,
    map_id: 'e1', creature_scale: 0.5,
    bounds: { y_min: 1.5, y_max: 8 },
    species: SPECIES,
    organisms: options.organisms ?? [],
  };
  store.applySnapshot(snapshot, 1_000_000);
  if (options.live) store.setStatus('live');
  if (options.selectId) {
    selection.select(options.selectId);
    if (options.following) selection.setFollowing(true);
  }
  const result = render(<WorldContext.Provider value={{ store, selection }}>{ui}</WorldContext.Provider>);
  return { ...result, store, selection };
}

/** `n` membranas com ids MBR-0001… */
export function membranas(n: number): OrganismInfo[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `MBR-${String(i + 1).padStart(4, '0')}`, species: 'membrana', born_ms: 0, p: [0, 0, 0], v: [0, 0, 0],
  }));
}
