// Espelho da planta do servidor (Abyss.Genesis.Blueprint e Traits): mesmo catálogo, mesmas contas,
// mesmas frases de erro. As fixtures em shared/genesis/fixtures conferem os dois lados.
import catalog from '../../../../shared/genesis/catalog-s1.json';
import type { Blueprint, PartKind } from '../services/wire';

type Effect = {
  max_speed?: number;
  turn_rate?: number;
  burst?: number;
  perception?: number;
  escape?: number;
  speed_factor?: number;
  school?: boolean;
  shelter?: boolean;
};
export interface PartSpec {
  group: string;
  cost: number;
  step: number;
  max: number;
  mirror: boolean;
  metab: number;
  diet?: 'flora' | 'particles' | 'predator';
  effect?: Effect;
}
export interface Catalog {
  version: number;
  budget: number;
  max_bytes: number;
  body: { points: number[]; length_max: number; bend_max: number; r: number[]; radius: number[]; cost_per_radius: number };
  parts_max: number;
  part_size: number[];
  part_angle: number[];
  patterns: string[];
  diminish: number;
  base: Record<'max_speed' | 'turn_rate' | 'burst' | 'perception' | 'wander' | 'sated_s' | 'energy_max' | 'escape', number>;
  caps: Record<'max_speed' | 'turn_rate' | 'burst' | 'perception' | 'escape', number>;
  metabolism: { base: number; per_radius2: number };
  life: { mature_s: number[]; adult_life_s: number[] };
  parts: Record<string, PartSpec>;
}

export const CATALOG = catalog as unknown as Catalog;

// Ordem alfabética: é a ordem das somas no servidor.
const KINDS = Object.keys(CATALOG.parts).sort() as PartKind[];
const spec = (kind: string): PartSpec | undefined =>
  Object.prototype.hasOwnProperty.call(CATALOG.parts, kind) ? CATALOG.parts[kind] : undefined;

export const INITIAL_BLUEPRINT: Blueprint = {
  v: 1,
  body: { spine: [[-0.3, 0, 0.35], [0, 0, 0.45], [0.3, 0, 0.35]] },
  parts: [],
  colors: { glow: '#7fe9dd', body: '#3f5a4a' },
  pattern: 'manchas',
};

/** Instâncias por tipo; peça espelhada conta 2. */
export function instances(bp: Blueprint): Record<PartKind, number> {
  const out = {} as Record<PartKind, number>;
  for (const k of KINDS) out[k] = 0;
  for (const p of bp.parts) out[p.kind] = (out[p.kind] ?? 0) + (p.mirror ? 2 : 1);
  return out;
}

/** Raio da esfera que envolve o corpo, limitado a `body.radius`. */
export function bodyRadius(bp: Blueprint): number {
  const spine = bp.body.spine;
  const n = spine.length;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of spine) {
    sx += x;
    sy += y;
  }
  const cx = sx / n;
  const cy = sy / n;
  let raw = -Infinity;
  for (const [x, y, r] of spine) raw = Math.max(raw, Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) + r);
  const [rmin, rmax] = CATALOG.body.radius;
  return Math.min(Math.max(raw, rmin), rmax);
}

function partsCost(inst: Record<PartKind, number>): number {
  let total = 0;
  for (const k of KINDS) {
    const { cost, step } = CATALOG.parts[k];
    for (let i = 1; i <= inst[k]; i++) total += cost + step * (i - 1);
  }
  return total;
}

/** Custo total: peças mais corpo. */
export function blueprintCost(bp: Blueprint): number {
  return partsCost(instances(bp)) + Math.ceil(CATALOG.body.cost_per_radius * bodyRadius(bp));
}

/** Custo de mais UMA instância de `kind`; null se estoura `max`, `parts_max`, o orçamento ou se já há boca. */
export function nextInstanceCost(bp: Blueprint, kind: PartKind): number | null {
  const s = spec(kind);
  if (!s) return null;
  const inst = instances(bp);
  const n = inst[kind] ?? 0;
  if (n + 1 > s.max) return null;
  const total = KINDS.reduce((a, k) => a + inst[k], 0);
  if (total + 1 > CATALOG.parts_max) return null;
  if (s.group === 'boca' && KINDS.some((k) => CATALOG.parts[k].group === 'boca' && inst[k] > 0)) return null;
  const add = s.cost + s.step * n;
  if (blueprintCost(bp) + add > CATALOG.budget) return null;
  return add;
}

// ---- validação (mesmas frases do servidor) ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inRange = (v: unknown, lo: number, hi: number) => isNum(v) && v >= lo && v <= hi;
const sameKeys = (o: Obj, keys: string[]) => {
  const ks = Object.keys(o);
  return ks.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
};
const COLOR = /^#[0-9a-f]{6}$/;
const GENERIC = ['planta inválida'];

/** Lista de erros; vazia se a planta vale. Nunca lança, qualquer que seja a entrada. */
export function validateBlueprint(bp: unknown): string[] {
  try {
    return check(bp);
  } catch {
    return GENERIC;
  }
}

type Result<T> = { ok: T } | { errors: string[] };

function check(term: unknown): string[] {
  if (!isObj(term)) return GENERIC;
  const json = JSON.stringify(term);
  if (json === undefined) return GENERIC;
  if (new TextEncoder().encode(json).length > CATALOG.max_bytes) return ['planta grande demais'];
  if (!sameKeys(term, ['v', 'body', 'parts', 'colors', 'pattern'])) return ['formato da planta inválido'];
  if (term.v !== 1) return ['versão da planta desconhecida'];

  const spine = checkSpine(term.body);
  if ('errors' in spine) return spine.errors;
  const parts = checkParts(term.parts);
  if ('errors' in parts) return parts.errors;
  const colors = checkColors(term.colors);
  if (colors) return colors;
  const pattern = term.pattern;
  if (!(typeof pattern === 'string' && CATALOG.patterns.includes(pattern))) return ['padrão inválido'];

  return checkTotals({
    v: 1,
    body: { spine: spine.ok as Blueprint['body']['spine'] },
    parts: parts.ok,
    colors: term.colors as Blueprint['colors'],
    pattern: pattern as Blueprint['pattern'],
  });
}

function checkSpine(body: unknown): Result<number[][]> {
  if (!isObj(body) || !sameKeys(body, ['spine']) || !Array.isArray(body.spine)) return { errors: ['corpo inválido'] };
  const [pmin, pmax] = CATALOG.body.points;
  const raw = body.spine as unknown[];
  if (raw.length < pmin || raw.length > pmax) return { errors: [`espinha precisa de ${pmin} a ${pmax} pontos`] };
  const pts: number[][] = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 3 || !p.every(isNum)) return { errors: ['ponto da espinha inválido'] };
    pts.push(p as number[]);
  }
  const [rmin, rmax] = CATALOG.body.r;
  let increasing = true;
  for (let i = 1; i < pts.length; i++) if (!(pts[i][0] > pts[i - 1][0])) increasing = false;
  const errs: string[] = [];
  if (!increasing) errs.push('espinha precisa de x crescente');
  if (increasing && pts[pts.length - 1][0] - pts[0][0] > CATALOG.body.length_max) errs.push('corpo comprido demais');
  if (pts.some((p) => Math.abs(p[1]) > CATALOG.body.bend_max)) errs.push('espinha curva demais');
  if (pts.some((p) => p[2] < rmin || p[2] > rmax)) errs.push('raio da espinha fora da faixa');
  return errs.length === 0 ? { ok: pts } : { errors: errs };
}

function checkParts(parts: unknown): Result<Blueprint['parts']> {
  if (!Array.isArray(parts)) return { errors: ['peças inválidas'] };
  if (parts.length > CATALOG.parts_max) return { errors: ['peças demais'] };
  const ok: Blueprint['parts'] = [];
  const errs: string[] = [];
  for (const part of parts) {
    const r = checkPart(part);
    if (typeof r === 'string') {
      if (!errs.includes(r)) errs.push(r);
    } else ok.push(r);
  }
  return errs.length > 0 ? { errors: errs } : { ok };
}

function checkPart(part: unknown): Blueprint['parts'][number] | string {
  if (!isObj(part) || typeof part.kind !== 'string') return 'peça com formato inválido';
  const s = spec(part.kind);
  const [smin, smax] = CATALOG.part_size;
  const [amin, amax] = CATALOG.part_angle;
  if (!sameKeys(part, ['kind', 'at', 'around', 'size', 'angle', 'mirror'])) return 'peça com formato inválido';
  if (!s) return 'peça fora do catálogo';
  if (!inRange(part.at, 0, 1)) return 'posição da peça fora de 0 a 1';
  if (!inRange(part.around, -Math.PI, Math.PI)) return 'ângulo em volta fora da faixa';
  if (!inRange(part.size, smin, smax)) return 'tamanho da peça fora da faixa';
  if (!inRange(part.angle, amin, amax)) return 'inclinação da peça fora da faixa';
  if (typeof part.mirror !== 'boolean') return 'espelho da peça inválido';
  if (part.mirror && !s.mirror) return 'peça não pode ser espelhada';
  return part as unknown as Blueprint['parts'][number];
}

function checkColors(c: unknown): string[] | null {
  if (!isObj(c) || !sameKeys(c, ['glow', 'body'])) return ['cores inválidas'];
  const ok = (v: unknown) => typeof v === 'string' && COLOR.test(v);
  return ok(c.glow) && ok(c.body) ? null : ['cor inválida'];
}

function checkTotals(bp: Blueprint): string[] {
  const inst = instances(bp);
  const mouths = KINDS.filter((k) => CATALOG.parts[k].group === 'boca').reduce((a, k) => a + inst[k], 0);
  const total = KINDS.reduce((a, k) => a + inst[k], 0);
  const errs: string[] = [];
  if (mouths !== 1) errs.push('precisa de exatamente uma boca');
  if (KINDS.some((k) => inst[k] > CATALOG.parts[k].max)) errs.push('peça repetida além do máximo');
  if (total > CATALOG.parts_max) errs.push('peças demais');
  if (errs.length === 0 && blueprintCost(bp) > CATALOG.budget) return ['estoura o orçamento'];
  return errs;
}

// ---- características (Abyss.Genesis.Traits) ----

export interface PreviewTraits {
  max_speed: number;
  turn_rate: number;
  burst: number;
  perception: number;
  escape: number;
  metabolism: number;
  body_radius: number;
  mature_s: number;
  adult_life_s: number;
  school: boolean;
  shelter: boolean;
  diet: 'flora' | 'particles' | 'predator';
  wander: number;
  sated_s: number;
  energy_max: number;
}

const STATS = ['max_speed', 'turn_rate', 'burst', 'perception', 'escape'] as const;

export function previewTraits(bp: Blueprint): PreviewTraits {
  const inst = instances(bp);
  const present = KINDS.filter((k) => inst[k] > 0);
  const r = bodyRadius(bp);
  const vals = {} as Record<(typeof STATS)[number], number>;
  for (const stat of STATS) {
    let sum = 0;
    for (const k of present) {
      const eff = CATALOG.parts[k].effect?.[stat];
      if (eff === undefined) continue;
      for (let i = 1; i <= inst[k]; i++) sum += eff * Math.pow(CATALOG.diminish, i - 1);
    }
    vals[stat] = Math.min(CATALOG.base[stat] + sum, CATALOG.caps[stat]);
  }
  for (const k of present) {
    const f = CATALOG.parts[k].effect?.speed_factor;
    if (f === undefined) continue;
    for (let i = 0; i < inst[k]; i++) vals.max_speed *= f;
  }
  let metabolism = CATALOG.metabolism.base + CATALOG.metabolism.per_radius2 * r * r;
  for (const k of present) metabolism += CATALOG.parts[k].metab * inst[k];
  const mouth = present.find((k) => CATALOG.parts[k].group === 'boca');
  const [m0, m1] = CATALOG.life.mature_s;
  const [a0, a1] = CATALOG.life.adult_life_s;
  return {
    ...vals,
    metabolism,
    body_radius: r,
    mature_s: m0 + m1 * r,
    adult_life_s: a0 + a1 * r,
    school: present.some((k) => CATALOG.parts[k].effect?.school === true),
    shelter: present.some((k) => CATALOG.parts[k].effect?.shelter === true),
    diet: (mouth && CATALOG.parts[mouth].diet) || 'flora',
    wander: CATALOG.base.wander,
    sated_s: CATALOG.base.sated_s,
    energy_max: CATALOG.base.energy_max,
  };
}
