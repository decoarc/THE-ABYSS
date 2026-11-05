import type { Selection } from './selection';
import type { Vitals, WorldStore } from './worldStore';

const scratch: Vitals = { energy: 0, juvenile: false, dividing: false, maturedAtMs: null, dyingSinceMs: null };

/**
 * Mantém a seleção coerente com o mundo: some quando o id sai do roster (reinício, predação ou fim do
 * desfazer) e solta o Seguir assim que o selecionado morre (a seleção fica até o fantasma sair).
 */
export function clearIfGone(store: WorldStore, selection: Selection): void {
  const { id } = selection.get();
  if (id === null) return;
  if (!store.vitals(id, scratch)) {
    selection.clear();
    return;
  }
  if (scratch.dyingSinceMs !== null) selection.setFollowing(false);
}
