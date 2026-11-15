import type { WorldStore } from '../services/worldStore';
import type { Blueprint } from '../services/wire';

/** Planta de um organismo: o genoma próprio, se já chegou; senão a da espécie (ou null). */
export function pickBlueprint(store: Pick<WorldStore, 'roster' | 'species' | 'genome'>, id: string): Blueprint | null {
  const org = store.roster().find((o) => o.id === id);
  if (!org) return null;
  if (org.g !== null && org.g !== undefined) {
    const own = store.genome(org.g);
    if (own) return own;
  }
  return store.species().find((s) => s.id === org.species)?.blueprint ?? null;
}
