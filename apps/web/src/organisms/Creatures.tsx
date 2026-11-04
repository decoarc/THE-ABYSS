import type { ComponentType } from 'react';
import { useRoster } from '../services/WorldProvider';
import { Casco } from './Casco';
import { Celula } from './Celula';
import { CreatureGlows } from './creatureGlow';
import { CreatureLights } from './creatureLights';
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

/** Componente da espécie, ou null para uma espécie que o cliente ainda não sabe desenhar. */
export function componentFor(species: string): CreatureComponent | null {
  return Object.hasOwn(BY_SPECIES, species) ? BY_SPECIES[species] : null;
}

/** Uma instância por organismo do roster; a posição de cada uma vem do servidor. */
export function Creatures() {
  const roster = useRoster();
  return (
    <>
      {roster.map((o) => {
        const Creature = componentFor(o.species);
        return Creature ? <Creature key={o.id} id={o.id} /> : null;
      })}
      <CreatureGlows />
      <CreatureLights />
      <SelectionRing />
    </>
  );
}
