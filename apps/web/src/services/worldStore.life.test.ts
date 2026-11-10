import { createWorldStore, DISSOLVE_MS, type Vitals } from './worldStore';
import type { DeathCause, OrganismInfo, SpeciesInfo, TickMessage, TickRow, Vec3, WorldSnapshot } from './wire';

const SERVER0 = 1_000_000;
const org = (id: string, over: Partial<OrganismInfo> = {}): OrganismInfo => ({
  id, species: 'casco', born_ms: 0, p: [0, 0, 0], v: [0, 0, 0],
  e: 0.8, stage: 'adult', dividing: false, gen: 1, parent: null, ...over,
});
function snap(ids: string[] = ['a', 'b', 'c'], over: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    world_id: 'w1', tick: 1, tick_hz: 10, server_ms: SERVER0, map_id: 'e1', creature_scale: 0.5,
    juvenile_scale: 0.4, divide_s: 3,
    bounds: { y_min: 1.5, y_max: 8 },
    species: [
      { id: 'casco', code: 'CAS', name: 'Casco', body_radius: 1, diet: { kind: 'flora', prey: [] }, extinct_ms: null },
      { id: 'fil', code: 'FIL', name: 'Filamento', body_radius: 1, diet: { kind: 'prey', prey: ['casco'] }, extinct_ms: 777 },
    ],
    organisms: ids.map((id, i) => org(id, { p: [i, 0, 0] })), flora: [], particles: [], ...over,
  };
}
const row = (x: number, e = 0.8, flags = 0): TickRow => [x, 0, 0, 0, 0, 0, e, flags];
const tick = (n: number, o: TickRow[], over: Partial<TickMessage> = {}): TickMessage => ({
  world_id: 'w1', tick: n, server_ms: SERVER0 + (n - 1) * 100, o, b: [], d: [], x: [], f: [], sp: [], ps: [], pr: [], ...over,
});
const L = (n: number) => SERVER0 + (n - 1) * 100 + 5;
type Store = ReturnType<typeof createWorldStore>;
const ids = (s: Store) => s.roster().map((o) => o.id);
function ready(list?: string[]) {
  const s = createWorldStore();
  s.applySnapshot(snap(list), L(1));
  return s;
}
const at = (s: Store, id: string, ms: number) => {
  const p: Vec3 = [0, 0, 0], v: Vec3 = [0, 0, 0];
  return s.sample(id, ms, p, v) ? p : null;
};
const vit = (): Vitals => ({ energy: 0, juvenile: false, dividing: false, maturedAtMs: null, dividingSinceMs: null, dyingSinceMs: null });

it('antes do snapshot: juvenileScale 1 e divideS 2; depois vêm do snapshot', () => {
  const s = createWorldStore();
  expect([s.juvenileScale(), s.divideS()]).toEqual([1, 2]);
  s.applySnapshot(snap(), L(1));
  expect([s.juvenileScale(), s.divideS()]).toEqual([0.4, 3]);
});

it('nascimento entra no fim', () => {
  const s = ready();
  const r0 = s.roster();
  const filho = org('d', { parent: 'a', gen: 2, stage: 'juvenile', p: [9, 0, 0] });
  expect(s.applyTick(tick(2, [row(0), row(1), row(2), row(9, 0.5, 1)], { b: [filho] }), L(2))).toBe('ok');
  expect(ids(s)).toEqual(['a', 'b', 'c', 'd']);
  expect(s.roster()).not.toBe(r0);
  expect(at(s, 'd', L(2) + 200)![0]).toBeCloseTo(9, 6);
  expect(s.debugBufferSize('d')).toBe(1);
  expect(s.positionsAt(2)).toEqual({ a: [0, 0, 0], b: [1, 0, 0], c: [2, 0, 0], d: [9, 0, 0] });
});

it('predação some na hora', () => {
  const s = ready();
  const d: [string, DeathCause][] = [['b', 'predation']];
  expect(s.applyTick(tick(2, [row(0), row(2)], { d }), L(2))).toBe('ok');
  expect(ids(s)).toEqual(['a', 'c']);
  expect(at(s, 'b', L(2))).toBeNull();
  expect(s.livingCount()).toBe(2);
  // c continua com o próprio ring depois do índice reconstruído
  s.applyTick(tick(3, [row(0), row(2.5)]), L(3));
  expect(s.debugBufferSize('c')).toBe(3);
  expect(s.positionsAt(3)).toEqual({ a: [0, 0, 0], c: [2.5, 0, 0] });
});

it('fome vira fantasma e sai depois de DISSOLVE_MS', () => {
  const s = ready();
  s.applyTick(tick(2, [row(0), row(2)], { d: [['b', 'starvation']] }), L(2));
  // b ficou fantasma na última posição (x=1, do snapshot)
  expect(ids(s).sort()).toEqual(['a', 'b', 'c']);
  expect(s.livingCount()).toBe(2);
  const out = vit();
  expect(s.vitals('b', out)).toBe(true);
  expect(out.dyingSinceMs).toBe(L(2));
  const p: Vec3 = [9, 9, 9], v: Vec3 = [9, 9, 9];
  expect(s.sample('b', L(2) + 5000, p, v)).toBe(true);
  expect(p).toEqual([1, 0, 0]);
  expect(v).toEqual([0, 0, 0]);

  const r = s.roster();
  let n = 3;
  while (L(n) - L(2) < DISSOLVE_MS) {
    s.applyTick(tick(n, [row(0), row(2)]), L(n));
    expect(s.roster()).toBe(r);
    n++;
  }
  s.applyTick(tick(n, [row(0), row(2)]), L(n));
  expect(ids(s)).toEqual(['a', 'c']);
  expect(s.vitals('b', out)).toBe(false);
  expect(s.roster()).not.toBe(r);
});

it('velhice também vira fantasma', () => {
  const s = ready();
  s.applyTick(tick(2, [row(0), row(1)], { d: [['c', 'old_age']] }), L(2));
  expect(ids(s)).toContain('c');
  expect(s.livingCount()).toBe(2);
});

it('lacuna com nascimento força resync', () => {
  const s = ready();
  expect(s.applyTick(tick(3, [row(0), row(1), row(2), row(9)], { b: [org('d')] }), L(3))).toBe('resync');
  expect(ids(s)).toEqual(['a', 'b', 'c']);
  expect(s.lastTick()).toBe(1);
});

it('contagem divergente força resync, sem escrever em nenhum ring', () => {
  const s = ready();
  // d tira b, b traz d: esperados 3, mas o chega com 4 linhas
  const bad = tick(2, [row(10), row(11), row(12), row(13)], { d: [['b', 'predation']], b: [org('d')] });
  expect(s.applyTick(bad, L(2))).toBe('resync');
  expect(ids(s)).toEqual(['a', 'b', 'c']);
  for (const id of ['a', 'b', 'c']) expect(s.debugBufferSize(id)).toBe(1);
  expect(s.lastTick()).toBe(1);
  expect(s.applyTick(tick(2, [row(0)], { d: [['zzz', 'predation']] }), L(2))).toBe('resync');
});

it('muitos nascimentos num tick: todos amostráveis e uma notificação só', () => {
  const s = ready();
  const filhos = Array.from({ length: 60 }, (_, i) => org(`n${i}`, { p: [i, 0, 0] }));
  let calls = 0;
  s.subscribe(() => calls++);
  const o = [row(0), row(1), row(2), ...filhos.map((_, i) => row(i))];
  expect(s.applyTick(tick(2, o, { b: filhos }), L(2))).toBe('ok');
  expect(calls).toBe(1);
  expect(s.livingCount()).toBe(63);
  for (let i = 0; i < 60; i++) expect(at(s, `n${i}`, L(2))).not.toBeNull();
});

it('extinção: x grava o ms e o snapshot mantém extinct_ms', () => {
  const s = ready();
  expect(s.extinct().get('fil')).toBe(777);
  expect(s.extinct().has('casco')).toBe(false);
  const before = s.extinct();
  s.applyTick(tick(2, [row(0), row(1), row(2)], { x: [['casco', 4200]] }), L(2));
  expect(s.extinct().get('casco')).toBe(4200);
  expect(s.extinct()).not.toBe(before);
  s.applySnapshot(snap(['a'], { tick: 9, species: [
    { id: 'casco', code: 'CAS', name: 'Casco', body_radius: 1, diet: { kind: 'flora', prey: [] }, extinct_ms: 4200 },
  ] }), L(9));
  expect(s.extinct().get('casco')).toBe(4200);
  expect(s.extinct().has('fil')).toBe(false);
});

it('vitals: energia e flags do último tick; maturedAtMs quando o bit de jovem cai', () => {
  const s = createWorldStore();
  s.applySnapshot(snap(['a'], { organisms: [org('a', { stage: 'juvenile', e: 0.5, dividing: false })] }), L(1));
  const out: Vitals = { energy: 0, juvenile: false, dividing: false, maturedAtMs: 1, dividingSinceMs: 1, dyingSinceMs: 1 };
  expect(s.vitals('nada', out)).toBe(false);
  expect(s.vitals('a', out)).toBe(true);
  expect(out).toEqual({ energy: 0.5, juvenile: true, dividing: false, maturedAtMs: null, dividingSinceMs: null, dyingSinceMs: null });
  s.applyTick(tick(2, [row(0, 0.42, 1)]), L(2));
  s.vitals('a', out);
  expect(out).toMatchObject({ energy: 0.42, juvenile: true, maturedAtMs: null });
  s.applyTick(tick(3, [row(0, 0.9, 2)]), L(3));
  s.vitals('a', out);
  expect(out).toEqual({ energy: 0.9, juvenile: false, dividing: true, maturedAtMs: L(3), dividingSinceMs: L(3), dyingSinceMs: null });
  s.applyTick(tick(4, [row(0, 0.9, 0)]), L(4));
  s.vitals('a', out);
  expect(out.maturedAtMs).toBe(L(3));
});

it('fantasma congela onde o cliente desenhava na morte, não na amostra mais nova', () => {
  const s = ready();
  const mv = (x: number): TickRow => [x, 0, 0, 100, 0, 0, 0.8, 0];
  s.applyTick(tick(2, [mv(0), mv(10), mv(2)]), L(2));
  s.applyTick(tick(3, [mv(0), mv(20), mv(2)]), L(3));
  const shown = at(s, 'b', L(4))!;
  expect(shown[0]).toBeLessThan(20);
  s.applyTick(tick(4, [mv(0), mv(2)], { d: [['b', 'starvation']] }), L(4));
  expect(at(s, 'b', L(4) + 5000)).toEqual(shown);
});

it('vitals: dividingSinceMs marca quando o bit de divisão ligou', () => {
  const s = createWorldStore();
  s.applySnapshot(snap(['a'], { organisms: [org('a')] }), L(1));
  const out = vit();
  s.vitals('a', out);
  expect(out.dividingSinceMs).toBeNull();
  s.applyTick(tick(2, [row(0, 0.9, 2)]), L(2));
  s.applyTick(tick(3, [row(0, 0.9, 2)]), L(3));
  s.vitals('a', out);
  expect(out.dividingSinceMs).toBe(L(2));
  s.applyTick(tick(4, [row(0, 0.9, 0)]), L(4));
  s.vitals('a', out);
  expect(out.dividingSinceMs).toBeNull();
});

it('fantasma guarda juvenil/divisão do momento da morte', () => {
  const s = createWorldStore();
  s.applySnapshot(snap(['a', 'b'], { organisms: [org('a', { stage: 'juvenile' }), org('b')] }), L(1));
  s.applyTick(tick(2, [row(0, 0.5, 1), row(1, 0.5, 2)]), L(2));
  s.applyTick(tick(3, [row(0, 0.5, 1), row(1, 0.5, 2)]), L(3));
  s.applyTick(tick(4, [], { d: [['a', 'starvation'], ['b', 'old_age']] }), L(4));
  const out = vit();
  s.vitals('a', out);
  expect(out).toMatchObject({ juvenile: true, dividing: false, dyingSinceMs: L(4) });
  s.vitals('b', out);
  expect(out).toMatchObject({ juvenile: false, dividing: true, dividingSinceMs: L(2), dyingSinceMs: L(4) });
});

const criada = (over: Partial<SpeciesInfo> = {}): SpeciesInfo => ({
  id: 'sp1', code: 'S01', name: 'Nova', body_radius: 0.65, diet: { kind: 'predator', prey: [] }, extinct_ms: null, blueprint: null, ...over,
});

it('sp acrescenta espécie antes dos nascidos', () => {
  const s = ready();
  const sp0 = s.species();
  const seen: string[][] = [];
  s.subscribe(() => seen.push(s.species().map((x) => x.id)));
  const filho = org('d', { species: 'sp1', p: [9, 0, 0] });
  expect(s.applyTick(tick(2, [row(0), row(1), row(2), row(9)], { sp: [criada()], b: [filho] }), L(2))).toBe('ok');
  expect(s.species()).not.toBe(sp0);
  expect(s.species().map((x) => x.id)).toEqual(['casco', 'fil', 'sp1']);
  expect(s.species().find((x) => x.id === 'sp1')!.diet.kind).toBe('predator');
  expect(ids(s)).toEqual(['a', 'b', 'c', 'd']);
  expect(seen[0]).toContain('sp1');
});

it('sp repetida não duplica nem muda a identidade', () => {
  const s = ready();
  s.applyTick(tick(2, [row(0), row(1), row(2)], { sp: [criada()] }), L(2));
  const after = s.species();
  s.applyTick(tick(3, [row(0), row(1), row(2)], { sp: [criada()] }), L(3));
  expect(s.species()).toBe(after);
  expect(s.species().filter((x) => x.id === 'sp1')).toHaveLength(1);
  // Conteúdo novo para o mesmo id substitui; extinct_ms alimenta o mapa.
  s.applyTick(tick(4, [row(0), row(1), row(2)], { sp: [criada({ extinct_ms: 555 })] }), L(4));
  expect(s.species().filter((x) => x.id === 'sp1')).toHaveLength(1);
  expect(s.extinct().get('sp1')).toBe(555);
});

it('nascido de espécie desconhecida não quebra', () => {
  const s = ready();
  const filho = org('d', { species: 'fantasma', p: [9, 0, 0] });
  expect(s.applyTick(tick(2, [row(0), row(1), row(2), row(9)], { b: [filho] }), L(2))).toBe('ok');
  expect(ids(s)).toEqual(['a', 'b', 'c', 'd']);
  expect(at(s, 'd', L(2) + 200)![0]).toBeCloseTo(9, 6);
  // Tick antigo sem `sp` também vale.
  const old = tick(3, [row(0), row(1), row(2), row(9)]) as Partial<TickMessage>;
  delete old.sp;
  expect(s.applyTick(old as TickMessage, L(3))).toBe('ok');
});
