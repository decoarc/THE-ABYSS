import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createSelection, type Selection, type SelectionState } from './selection';
import { clearIfGone } from './selectionSync';
import type { OrganismInfo } from './wire';
import { connectWorld, type SocketLike } from './worldConnection';
import { createWorldStore, type ConnectionStatus, type WorldStore } from './worldStore';

interface WorldContextValue {
  store: WorldStore;
  selection: Selection;
}

const WorldContext = createContext<WorldContextValue | null>(null);

export function WorldProvider({
  url,
  socketFactory,
  children,
}: {
  url: string;
  socketFactory?: (url: string) => SocketLike;
  children: ReactNode;
}) {
  const [value] = useState<WorldContextValue>(() => ({
    store: createWorldStore(),
    selection: createSelection(),
  }));

  useEffect(() => connectWorld(value.store, { url, socketFactory }), [value, url, socketFactory]);

  // Mudou o roster (reinício ou morte): a seleção que saiu do mundo é solta.
  useEffect(() => value.store.subscribe(() => clearIfGone(value.store, value.selection)), [value]);

  return <WorldContext.Provider value={value}>{children}</WorldContext.Provider>;
}

export function useWorld(): WorldContextValue {
  const v = useContext(WorldContext);
  if (!v) throw new Error('useWorld fora do WorldProvider');
  return v;
}

export function useRoster(): readonly OrganismInfo[] {
  const { store } = useWorld();
  return useSyncExternalStore(store.subscribe, store.roster);
}

export function useConnectionStatus(): ConnectionStatus {
  const { store } = useWorld();
  return useSyncExternalStore(store.subscribe, store.status);
}

export function useSelection(): SelectionState {
  const { selection } = useWorld();
  return useSyncExternalStore(selection.subscribe, selection.get);
}
