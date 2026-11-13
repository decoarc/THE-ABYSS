import { act, fireEvent, screen } from '@testing-library/react';
import { LineageButton } from './LineageButton';
import { renderWithWorld } from '../test-utils/world';
import type { OrganismInfo, SpeciesInfo } from '../services/wire';

const BORN = new Date(2026, 10, 3, 10, 0).getTime();
const sp = (id: string, name: string, parent: string | null, born_ms: number | null, over: Partial<SpeciesInfo> = {}): SpeciesInfo => ({
  id, code: id.toUpperCase(), name, body_radius: 1, diet: { kind: 'flora', prey: [] }, extinct_ms: null,
  parent, root: id.split('.')[0], region: null, born_ms, ...over,
});
const org = (id: string, species: string): OrganismInfo => ({
  id, species, born_ms: 0, p: [0, 0, 0], v: [0, 0, 0], e: 0.8, stage: 'adult', dividing: false, gen: 1, parent: null, g: null,
});

const SPECIES = [
  sp('sp1', 'Lumina', null, BORN),
  sp('sp1.1', 'Lumina · Floresta', 'sp1', BORN + 100),
  sp('sp1.2', 'Lumina · Abismo', 'sp1', BORN + 200),
  sp('sp1.1.1', 'Lumina · Floresta · Raso', 'sp1.1', BORN + 300),
];
const ORGS = [
  org('A-0001', 'sp1'), org('A-0002', 'sp1'),
  org('B-0001', 'sp1.1'), org('B-0002', 'sp1.1'),
  org('C-0001', 'sp1.2'),
  org('D-0001', 'sp1.1.1'),
];

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Árvore da espécie' }));

it('abre e fecha pelo botão', () => {
  renderWithWorld(<LineageButton />, { species: SPECIES, organisms: ORGS });
  expect(screen.queryByRole('dialog')).toBeNull();
  open();
  expect(screen.getByRole('dialog', { name: 'Árvore da espécie' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Árvore da espécie' })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'fechar' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('mostra a árvore da espécie selecionada', () => {
  renderWithWorld(<LineageButton />, { species: SPECIES, organisms: ORGS, selectId: 'D-0001' });
  open();
  expect(screen.getByRole('dialog')).toHaveTextContent('Lumina (criada em 03/11)');
  expect(screen.getByRole('button', { name: /^Lumina\s+2 vivos$/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Lumina · Floresta\s+2 vivos$/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Lumina · Abismo\s+1 vivo$/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Lumina · Floresta · Raso\s+1 vivo$/ })).toBeInTheDocument();
});

it('sem seleção pede para escolher', () => {
  renderWithWorld(<LineageButton />, { species: [...SPECIES, sp('sp2', 'Vazia', null, BORN)], organisms: ORGS });
  open();
  expect(screen.getByRole('dialog')).toHaveTextContent('Escolha uma espécie');
  expect(screen.queryByRole('button', { name: /Vazia/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Lumina/ }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Lumina (criada em 03/11)');
});

it('clicar num ramo vivo seleciona um vivo dele', () => {
  const { selection } = renderWithWorld(<LineageButton />, { species: SPECIES, organisms: ORGS, selectId: 'A-0001' });
  open();
  fireEvent.click(screen.getByRole('button', { name: /^Lumina · Floresta · Raso/ }));
  expect(selection.get().id).toBe('D-0001');
});

it('ramo extinto mostra a data e não é clicável', () => {
  const ms = new Date(2026, 10, 5, 9, 7).getTime();
  const species = [SPECIES[0], SPECIES[1], sp('sp1.2', 'Lumina · Abismo', 'sp1', BORN + 200, { extinct_ms: ms })];
  const { selection } = renderWithWorld(<LineageButton />, {
    species, organisms: [org('A-0001', 'sp1'), org('B-0001', 'sp1.1')], selectId: 'A-0001',
  });
  open();
  const extinta = screen.getByRole('button', { name: /Lumina · Abismo/ });
  expect(extinta).toHaveTextContent('extinta · 05/11 09:07');
  expect(extinta).toBeDisabled();
  fireEvent.click(extinta);
  expect(selection.get().id).toBe('A-0001');
});

it('singular: 1 vivo', () => {
  renderWithWorld(<LineageButton />, { species: SPECIES, organisms: [org('A-0001', 'sp1')], selectId: 'A-0001' });
  open();
  expect(screen.getByRole('button', { name: /^Lumina\s+1 vivo$/ })).toBeInTheDocument();
});

it('atualiza quando um vivo morre', () => {
  const { store } = renderWithWorld(<LineageButton />, { species: SPECIES, organisms: ORGS, selectId: 'A-0001' });
  open();
  act(() => {
    store.applyTick(
      { world_id: 'w1', tick: 2, server_ms: 1_000_100, o: ORGS.filter((o) => o.id !== 'C-0001').map(() => [0, 0, 0, 0, 0, 0, 0.8, 0]), b: [], d: [['C-0001', 'starvation']], x: [], f: [], sp: [], g: [], rb: [], ps: [], pr: [] },
      1_000_100,
    );
  });
  expect(screen.getByRole('button', { name: /^Lumina · Abismo/ })).toBeDisabled();
});
