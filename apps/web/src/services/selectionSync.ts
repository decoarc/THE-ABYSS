import type { Selection } from './selection';
import type { WorldStore } from './worldStore';

/** Solta a seleção se o id selecionado saiu do roster (reinício do mundo ou morte). */
export function clearIfGone(store: WorldStore, selection: Selection): void {
  const { id } = selection.get();
  if (id === null) return;
  if (!store.roster().some((o) => o.id === id)) selection.clear();
}
