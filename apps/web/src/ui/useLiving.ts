import { useMemo, useSyncExternalStore } from 'react';
import type { Vitals } from '../services/worldStore';
import { useRoster, useWorld } from '../services/WorldProvider';

/** Vivos por espécie (sem os fantasmas), extintas e espécies; recalcula só quando a store avisa. */
export function useLiving() {
  const roster = useRoster();
  const { store } = useWorld();
  // Um fantasma não muda a identidade do roster, mas muda a contagem de vivos.
  const total = useSyncExternalStore(store.subscribe, store.livingCount);
  const extinct = useSyncExternalStore(store.subscribe, store.extinct);
  const species = useSyncExternalStore(store.subscribe, store.species);
  const bySpecies = useMemo(() => {
    const vitals: Vitals = { energy: 0, juvenile: false, dividing: false, maturedAtMs: null, dividingSinceMs: null, dyingSinceMs: null };
    const map = new Map<string, number>();
    for (const o of roster) {
      if (store.vitals(o.id, vitals) && vitals.dyingSinceMs === null) map.set(o.species, (map.get(o.species) ?? 0) + 1);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `total` invalida quando um fantasma nasce
  }, [roster, store, total]);
  return { species, extinct, bySpecies, total };
}
