import { useMemo, useSyncExternalStore, type ComponentType } from 'react';
import { useRoster, useWorld } from '../services/WorldProvider';
import type { SpeciesInfo } from '../services/wire';
import { Casco } from './Casco';
import { Celula } from './Celula';
import { CreatureGlows } from './creatureGlow';
import { CreatureLights } from './creatureLights';
import { Criada } from './Criada';
import { Filamento } from './Filamento';
import { Membrana } from './Membrana';
import { Poliedro } from './Poliedro';
import { SelectionRing } from './SelectionRing';

type CreatureComponent = ComponentType<{ id: string }>;

const BY_SPECIES: Record<string, CreatureComponent> = {
  membrana: Membrana,
  filamento: Filamento,
  casco: Casco,
  celula: Celula,
  poliedro: Poliedro,
};

/**
 * Componente da espécie: as 5 de teste pelo id, qualquer espécie com planta desenhada pela `Criada`,
 * e null para uma espécie que o cliente ainda não conhece ou não sabe desenhar.
 */
export function componentFor(species: SpeciesInfo | undefined): CreatureComponent | null {
  if (!species) return null;
  if (Object.hasOwn(BY_SPECIES, species.id)) return BY_SPECIES[species.id];
  return species.blueprint ? Criada : null;
}

/** Uma instância por organismo do roster; a posição de cada uma vem do servidor. */
export function Creatures() {
  const roster = useRoster();
  const { store } = useWorld();
  const species = useSyncExternalStore(store.subscribe, store.species);
  const byId = useMemo(() => new Map(species.map((s) => [s.id, s])), [species]);
  return (
    <>
      {roster.map((o) => {
        const Creature = componentFor(byId.get(o.species));
        return Creature ? <Creature key={o.id} id={o.id} /> : null;
      })}
      <CreatureGlows />
      <CreatureLights />
      <SelectionRing />
    </>
  );
}
