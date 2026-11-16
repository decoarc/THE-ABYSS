import { act, fireEvent, screen } from '@testing-library/react';
import { LineageButton } from './LineageButton';
import { renderWithWorld } from '../test-utils/world';
import type { OrganismInfo, SpeciesInfo } from '../services/wire';
import type { HistoryNode, HistoryTree } from '../services/speciesApi';
import { lineageUi } from '../services/lineageUi';

// Sem história por padrão (404): a árvore funciona como antes do gate P.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
});
afterEach(() => vi.unstubAllGlobals());

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

it('a árvore rola com a barra do tema', () => {
  renderWithWorld(<LineageButton />, { species: SPECIES, organisms: ORGS });
  open();
  expect(screen.getByRole('dialog')).toHaveClass('abyss-scroll');
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

describe('com história', () => {
  const iso = (d: Date) => d.toISOString();
  const node = (id: string, name: string, over: Partial<HistoryNode> = {}): HistoryNode => ({
    id, name, born_at: iso(new Date(2026, 10, 3, 10, 0)), region: null, diff: {}, extinct: null, children: [], ...over,
  });

  function serve(tree: HistoryTree | 'down') {
    const fetch = vi.fn(async (_url: string) => {
      if (tree === 'down') throw new TypeError('network');
      return new Response(JSON.stringify(tree), { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  afterEach(() => vi.unstubAllGlobals());

  const HIST: HistoryTree = {
    root: node('sp1', 'Lumina', {
      children: [
        node('sp1.1', 'Lumina · Floresta', { born_at: iso(new Date(2026, 10, 6, 15, 30)), diff: { flagelo: 1, placa: -1 } }),
        node('sp1.2', 'Lumina · Abismo', {
          born_at: iso(new Date(2026, 10, 7, 8, 0)),
          extinct: {
            at: iso(new Date(2026, 10, 14, 19, 40)),
            cause: 'predation',
            predator: { id: 'sp7', name: 'Garra' },
            final: [
              { cause: 'predation', predator_name: 'Garra', share: 0.7 },
              { cause: 'starvation', predator_name: null, share: 0.3 },
            ],
          },
        }),
        node('sp1.3', 'Lumina · Recife', {
          extinct: { at: iso(new Date(2026, 10, 9, 22, 3)), cause: null, predator: null, final: [] },
        }),
      ],
    }),
    restarts: [iso(new Date(2026, 10, 12, 4, 0))],
  };

  it('nó extinto mostra causa e reta final', async () => {
    const fetch = serve(HIST);
    renderWithWorld(<LineageButton />, { species: SPECIES.slice(0, 3), organisms: ORGS.slice(0, 4), selectId: 'A-0001' });
    open();
    const dialog = screen.getByRole('dialog');
    expect(await screen.findByText('última morte: predação por Garra')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('últimos 30 min: 70% predação por Garra, 30% fome');
    expect(screen.getByRole('button', { name: /Lumina · Abismo/ })).toHaveTextContent('✕ extinta 14/11 19:40');
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/api\/species\/sp1\/history$/);
  });

  it('linha secundária longa quebra sob o texto, sem passar do painel', async () => {
    serve(HIST);
    renderWithWorld(<LineageButton />, { species: SPECIES.slice(0, 3), organisms: ORGS.slice(0, 4), selectId: 'A-0001' });
    open();
    const text = await screen.findByText('últimos 30 min: 70% predação por Garra, 30% fome');
    expect(text).toHaveStyle({ whiteSpace: 'normal' });
    expect(text.parentElement).toHaveStyle({ display: 'flex' });
  });

  it('ramo mostra nascimento e diferenças', async () => {
    serve(HIST);
    renderWithWorld(<LineageButton />, { species: SPECIES.slice(0, 3), organisms: ORGS.slice(0, 4), selectId: 'A-0001' });
    open();
    expect(await screen.findByText('nasceu 06/11 · +flagelo −placa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Lumina · Floresta\s+2 vivos$/ })).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('mundo recomeçado em 12/11');
  });

  it('extinção antiga mostra causa não registrada', async () => {
    serve(HIST);
    renderWithWorld(<LineageButton />, { species: SPECIES.slice(0, 3), organisms: ORGS.slice(0, 4), selectId: 'A-0001' });
    open();
    expect(await screen.findByText('última morte: causa não registrada')).toBeInTheDocument();
    // Ramo que só a história conhece (podado da store) aparece mesmo assim, sem clique.
    expect(screen.getByRole('button', { name: /Lumina · Recife/ })).toBeDisabled();
  });

  it('sem história mostra a árvore de hoje', async () => {
    const fetch = serve('down');
    renderWithWorld(<LineageButton />, { species: SPECIES, organisms: ORGS, selectId: 'D-0001' });
    open();
    await act(async () => {});
    expect(fetch).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^Lumina · Floresta · Raso\s+1 vivo$/ })).toBeInTheDocument();
    expect(screen.queryByText(/última morte/)).toBeNull();
  });

  it('abre pela raiz pedida no lineageUi', async () => {
    serve({ root: node('sp9', 'Antiga', { extinct: { at: iso(new Date(2026, 10, 1, 8, 0)), cause: 'starvation', predator: null, final: [{ cause: 'starvation', predator_name: null, share: 1 }] } }), restarts: [] });
    renderWithWorld(<LineageButton />, { species: SPECIES, organisms: ORGS, selectId: 'A-0001' });
    act(() => lineageUi.open('sp9'));
    expect(await screen.findByText('última morte: fome')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveTextContent('Antiga');
    expect(screen.getByRole('dialog')).toHaveTextContent('últimos 30 min: 100% fome');
  });
});
