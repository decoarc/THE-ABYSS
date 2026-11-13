import { buildLineage, firstLiving, rootOf } from './lineage';
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

it('firstLiving: o vivo de menor id do ramo', () => {
  const roster = [org('X-0010', 'x'), org('X-0002', 'x'), org('Y-0003', 'y')];
  expect(firstLiving(roster, 'x')).toBe('X-0002');
  expect(firstLiving(roster, 'z')).toBeNull();
});
