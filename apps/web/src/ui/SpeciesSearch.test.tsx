import { act, fireEvent, screen } from '@testing-library/react';
import { SpeciesSearch } from './SpeciesSearch';
import { renderWithWorld } from '../test-utils/world';
import { lineageUi } from '../services/lineageUi';
import { publishCamera } from '../scene/cameraPose';
import type { OrganismInfo, SpeciesInfo } from '../services/wire';

const sp = (id: string, name: string, parent: string | null, over: Partial<SpeciesInfo> = {}): SpeciesInfo => ({
  id, code: id.toUpperCase(), name, body_radius: 1, diet: { kind: 'flora', prey: [] }, extinct_ms: null,
  parent, root: id.split('.')[0], region: null, born_ms: 0, ...over,
});
const org = (id: string, species: string, p: [number, number, number]): OrganismInfo => ({
  id, species, born_ms: 0, p, v: [0, 0, 0], e: 0.8, stage: 'adult', dividing: false, gen: 1, parent: null, g: null,
});

const SPECIES = [
  sp('sp1', 'Lumina', null),
  sp('sp1.1', 'Lumina · Floresta', 'sp1'),
  sp('sp2', 'Garra', null, { extinct_ms: 5 }),
  sp('sp2.1', 'Garra · Vale', 'sp2'),
  sp('sp3', 'Recife', null, { extinct_ms: 5 }),
];
const ORGS = [
  org('L-0001', 'sp1', [40, 4, 0]),
  org('L-0002', 'sp1', [5, 4, 0]),
  org('F-0001', 'sp1.1', [1, 4, 0]),
  org('G-0001', 'sp2.1', [30, 4, 0]),
  org('G-0002', 'sp2.1', [8, 4, 0]),
];

type Result = { id: string; name: string; root: string; alive: boolean };

function replyWith(results: Result[] | 'error') {
  const fetch = vi.fn(async (_url: string) => {
    if (results === 'error') throw new TypeError('network');
    return new Response(JSON.stringify({ results }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function type(value: string) {
  fireEvent.change(screen.getByLabelText('Buscar espécie'), { target: { value } });
  await act(async () => {
    vi.advanceTimersByTime(250);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  lineageUi.close();
  publishCamera([0, 4, 0], null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('viva: seleciona a mais próxima e segue', async () => {
  const fetch = replyWith([{ id: 'sp1', name: 'Lumina', root: 'sp1', alive: true }]);
  const { selection } = renderWithWorld(<SpeciesSearch />, { species: SPECIES, organisms: ORGS });
  await type('lumi');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(String(fetch.mock.calls[0][0])).toMatch(/\/api\/species\/search\?q=lumi$/);
  fireEvent.click(screen.getByRole('button', { name: 'Lumina' }));
  expect(selection.get()).toEqual({ id: 'L-0002', following: true });
  expect(lineageUi.get().open).toBe(false);
  expect(screen.queryByRole('button', { name: 'Lumina' })).toBeNull();
});

it('extinta com ramo vivo: segue o ramo e abre a árvore da raiz', async () => {
  replyWith([{ id: 'sp2', name: 'Garra', root: 'sp2', alive: false }]);
  const { selection } = renderWithWorld(<SpeciesSearch />, { species: SPECIES, organisms: ORGS });
  await type('garra');
  fireEvent.click(screen.getByRole('button', { name: /Garra/ }));
  expect(selection.get()).toEqual({ id: 'G-0002', following: true });
  expect(lineageUi.get()).toEqual({ open: true, rootId: 'sp2' });
});

it('linhagem extinta: só abre a árvore', async () => {
  replyWith([{ id: 'sp3', name: 'Recife', root: 'sp3', alive: false }]);
  const { selection } = renderWithWorld(<SpeciesSearch />, { species: SPECIES, organisms: ORGS, selectId: 'L-0001' });
  await type('recife');
  fireEvent.click(screen.getByRole('button', { name: /Recife/ }));
  expect(selection.get()).toEqual({ id: 'L-0001', following: false });
  expect(lineageUi.get()).toEqual({ open: true, rootId: 'sp3' });
});

it('nome inexistente mostra o aviso e ele some ao digitar', async () => {
  replyWith([]);
  renderWithWorld(<SpeciesSearch />, { species: SPECIES, organisms: ORGS });
  await type('lumna');
  expect(screen.getByText('Nenhuma espécie com esse nome')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar espécie'), { target: { value: 'lumn' } });
  expect(screen.queryByText('Nenhuma espécie com esse nome')).toBeNull();
});

it('erro de rede avisa', async () => {
  replyWith('error');
  renderWithWorld(<SpeciesSearch />, { species: SPECIES, organisms: ORGS });
  await type('lumina');
  expect(screen.getByText('Não foi possível falar com o abismo.')).toBeInTheDocument();
});

it('1 letra não busca e só busca depois de 250 ms parado', async () => {
  const fetch = replyWith([]);
  renderWithWorld(<SpeciesSearch />, { species: SPECIES, organisms: ORGS });
  await type('l');
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Buscar espécie'), { target: { value: 'lu' } });
  await act(async () => {
    vi.advanceTimersByTime(200);
  });
  fireEvent.change(screen.getByLabelText('Buscar espécie'), { target: { value: 'lum' } });
  await act(async () => {
    vi.advanceTimersByTime(249);
  });
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('a lista de resultados rola com a barra do tema', async () => {
  replyWith([{ id: 'sp1', name: 'Lumina', root: 'sp1', alive: true }]);
  renderWithWorld(<SpeciesSearch />, { species: SPECIES, organisms: ORGS });
  await type('Lum');
  expect(screen.getByRole('button', { name: 'Lumina' }).parentElement).toHaveClass('abyss-scroll');
});
