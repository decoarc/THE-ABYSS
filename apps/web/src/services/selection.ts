export interface SelectionState {
  id: string | null;
  following: boolean;
}

export interface Selection {
  get(): SelectionState;
  select(id: string): void;
  clear(): void;
  setFollowing(on: boolean): void;
  subscribe(fn: () => void): () => void;
}

export function createSelection(): Selection {
  let state: SelectionState = { id: null, following: false };
  const listeners = new Set<() => void>();

  function set(next: SelectionState) {
    if (next.id === state.id && next.following === state.following) return;
    state = next;
    for (const fn of listeners) fn();
  }

  return {
    get: () => state,
    select: (id) => set({ id, following: false }),
    clear: () => set({ id: null, following: false }),
    setFollowing: (on) => {
      if (state.id === null) return;
      set({ id: state.id, following: on });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
