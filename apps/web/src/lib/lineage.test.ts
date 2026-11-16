import { buildLineage, firstLiving, nearestLiving, rootOf } from './lineage';
import { createWorldStore } from '../services/worldStore';
import type { OrganismInfo, SpeciesInfo } from '../services/wire';

const sp = (id: string, parent: string | null, born_ms: number | null, over: Partial<SpeciesInfo> = {}): SpeciesInfo => ({
  id, code: id, name: id, body_radius: 1, diet: { kind: 'flora', prey: [] }, extinct_ms: null,
  parent, root: id.split('.')[0], region: null, born_ms, ...over,
});
const org = (id: string, species: string): OrganismInfo => ({
  id, species, born_ms: 0, p: [0, 0, 0], v: [0, 0, 0], e: 1, stage: 'adult', dividing: false, gen: 1, parent: null, g: null,
});

it('árvore de três níveis na ordem de nascimento', () => {
  const list = [
    sp('sp3', null, 0),
    sp('sp3.2', 'sp3', 300),
    sp('sp3.1', 'sp3', 100),
    sp('sp3.1.1', 'sp3.1', 200),
    sp('sp9', null, 0),
  ];
  const living = new Map([['sp3', 4], ['sp3.1', 2], ['sp3.1.1', 1]]);
  const t = buildLineage(list, living, new Map(), 'sp3')!;
  expect(t.species.id).toBe('sp3');
  expect(t.living).toBe(4);
  expect(t.extinctMs).toBeNull();
  expect(t.children.map((c) => c.species.id)).toEqual(['sp3.1', 'sp3.2']);
  expect(t.children[0].children.map((c) => c.species.id)).toEqual(['sp3.1.1']);
  expect(t.children[0].children[0].living).toBe(1);
  expect(t.children[1].living).toBe(0);
});

it('empate de nascimento desempata pelo id', () => {
  const list = [sp('a', null, 0), sp('a.2', 'a', 10), sp('a.1', 'a', 10)];
  const t = buildLineage(list, new Map(), new Map(), 'a')!;
  expect(t.children.map((c) => c.species.id)).toEqual(['a.1', 'a.2']);
});

it('mãe extinta com ramo vivo', () => {
  const list = [sp('sp3', null, 0, { extinct_ms: 900 }), sp('sp3.1', 'sp3', 100)];
  const t = buildLineage(list, new Map([['sp3.1', 3]]), new Map([['sp3', 900]]), 'sp3')!;
  expect(t.extinctMs).toBe(900);
  expect(t.living).toBe(0);
  expect(t.children[0].living).toBe(3);
  expect(t.children[0].extinctMs).toBeNull();
  expect(buildLineage(list, new Map(), new Map(), 'nada')).toBeNull();
});

it('raiz de um ramo profundo', () => {
  const list = [sp('sp3', null, 0), sp('sp3.1', 'sp3', 1), sp('sp3.1.2', 'sp3.1', 2)];
  expect(rootOf(list, 'sp3.1.2')).toBe('sp3');
  expect(rootOf(list, 'sp3')).toBe('sp3');
  expect(rootOf(list, 'inexistente')).toBeNull();
});

it('espécie de teste é raiz de si mesma', () => {
  const list = [sp('casco', null, null)];
  expect(rootOf(list, 'casco')).toBe('casco');
  const t = buildLineage(list, new Map([['casco', 2]]), new Map(), 'casco')!;
  expect(t.children).toEqual([]);
  expect(t.living).toBe(2);
});

it('firstLiving: o vivo de menor id do ramo, sem fantasmas, pelo sufixo numérico', () => {
  const store = createWorldStore();
  const o = (id: string, species: string) => ({ ...org(id, species), p: [0, 0, 0] as [number, number, number] });
  store.applySnapshot({
    world_id: 'w', tick: 1, tick_hz: 10, server_ms: 1000, map_id: 'e1', creature_scale: 1, juvenile_scale: 1, divide_s: 1,
    bounds: { y_min: 0, y_max: 1 }, species: [sp('x', null, 0)], genomes: [], flora: [], particles: [],
    organisms: [o('X-10000', 'x'), o('X-0002', 'x'), o('X-9999', 'x'), o('Y-0003', 'y')],
  }, 1000);
  const row = (): [number, number, number, number, number, number, number, number] => [0, 0, 0, 0, 0, 0, 1, 0];
  expect(firstLiving(store, 'x')).toBe('X-0002');
  // X-0002 morre de fome: vira fantasma e não conta.
  store.applyTick({
    world_id: 'w', tick: 2, server_ms: 1100, o: [row(), row(), row()], sp: [], g: [], rb: [], b: [],
    d: [['X-0002', 'starvation']], x: [], f: [], ps: [], pr: [],
  }, 1100);
  expect(store.roster().some((r) => r.id === 'X-0002')).toBe(true);
  expect(firstLiving(store, 'x')).toBe('X-9999');
  expect(firstLiving(store, 'z')).toBeNull();
});

it('nearestLiving escolhe o mais perto e ignora fantasmas', () => {
  const store = createWorldStore();
  const at = (id: string, species: string, p: [number, number, number]): OrganismInfo => ({ ...org(id, species), p });
  store.applySnapshot(
    {
      world_id: 'w', tick: 1, tick_hz: 10, server_ms: 1_000_000, map_id: 'e1', creature_scale: 0.5,
      juvenile_scale: 0.45, divide_s: 2, bounds: { y_min: 1.5, y_max: 8 },
      species: [sp('sp1', null, 0), sp('sp1.1', 'sp1', 10), sp('sp2', null, 0)],
      organisms: [at('A-1', 'sp1', [10, 4, 0]), at('A-2', 'sp1', [3, 4, 0]), at('B-1', 'sp1.1', [1, 4, 0]), at('C-1', 'sp2', [0, 4, 0])],
      flora: [], particles: [], genomes: [],
    },
    1_000_000,
  );
  expect(nearestLiving(store, new Set(['sp1']), [0, 4, 0], 1_000_000)).toBe('A-2');
  expect(nearestLiving(store, new Set(['sp1', 'sp1.1']), [0, 4, 0], 1_000_000)).toBe('B-1');
  expect(nearestLiving(store, new Set(['sp9']), [0, 4, 0], 1_000_000)).toBeNull();

  // A-2 morre de fome: vira fantasma e deixa de contar.
  store.applyTick(
    { world_id: 'w', tick: 2, server_ms: 1_000_100, o: [[10, 4, 0, 0, 0, 0, 0.8, 0], [1, 4, 0, 0, 0, 0, 0.8, 0], [0, 4, 0, 0, 0, 0, 0.8, 0]], sp: [], b: [], g: [], rb: [], d: [['A-2', 'starvation']], x: [], f: [], ps: [], pr: [] },
    1_000_100,
  );
  expect(nearestLiving(store, new Set(['sp1']), [0, 4, 0], 1_000_100)).toBe('A-1');
});
