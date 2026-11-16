import { useSyncExternalStore } from 'react';

/** Estado compartilhado da árvore da espécie: aberta ou não, e a raiz pedida (pelo buscador). */
export interface LineageUiState {
  open: boolean;
  /** Raiz pedida de fora; null = a árvore segue a seleção, como antes. */
  rootId: string | null;
}

let state: LineageUiState = { open: false, rootId: null };
const listeners = new Set<() => void>();

function set(next: LineageUiState) {
  if (next.open === state.open && next.rootId === state.rootId) return;
  state = next;
  for (const fn of listeners) fn();
}

export const lineageUi = {
  get: (): LineageUiState => state,
  /** Abre a árvore; com `rootId`, mostra aquela raiz. */
  open: (rootId: string | null) => set({ open: true, rootId }),
  close: () => set({ open: false, rootId: null }),
  toggle: () => (state.open ? set({ open: false, rootId: null }) : set({ open: true, rootId: null })),
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export function useLineageUi(): LineageUiState {
  return useSyncExternalStore(lineageUi.subscribe, lineageUi.get);
}
