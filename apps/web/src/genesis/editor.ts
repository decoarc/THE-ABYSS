// Estado do editor de espécies: um reducer puro. A planta é tratada como imutável (arrays novos a cada
// mudança: o cache da espinha em geometry.ts é por identidade do array). Nenhuma ação deixa a planta
// fora das faixas do catálogo nem acima do orçamento: a ação que faria isso devolve o mesmo estado.
import type { Blueprint, BlueprintPart, PartKind, Pattern } from '../services/wire';
import { CATALOG, INITIAL_BLUEPRINT, blueprintCost, instances, nextInstanceCost } from './blueprint';

export type Selected = { kind: 'point' | 'part'; index: number } | null;

export interface EditorState {
  bp: Blueprint;
  selected: Selected;
}

export type EditorAction =
  | { type: 'addPart'; kind: PartKind }
  | { type: 'movePart'; index: number; at: number; around: number }
  | { type: 'setPartSize'; index: number; size: number }
  | { type: 'setPartAngle'; index: number; angle: number }
  | { type: 'toggleMirror'; index: number }
  | { type: 'removePart'; index: number }
  | { type: 'movePoint'; index: number; x: number; y: number }
  | { type: 'setThickness'; index: number; r: number }
  | { type: 'addPoint' }
  | { type: 'removePoint' }
  | { type: 'setColor'; which: 'glow' | 'body'; hex: string }
  | { type: 'setPattern'; pattern: Pattern }
  | { type: 'select'; selected: Selected };

export const initialEditorState: EditorState = { bp: INITIAL_BLUEPRINT, selected: null };

/** Distância mínima em x entre pontos vizinhos da espinha. */
export const MIN_GAP = 0.1;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const finite = (...vs: number[]) => vs.every(Number.isFinite);
const COLOR = /^#[0-9a-f]{6}$/;

/** Onde cada tipo nasce: bocas e ocelos na cabeça, flagelos na cauda, o resto no meio. */
function placement(kind: PartKind, existing: number): { at: number; around: number } {
  const group = CATALOG.parts[kind].group;
  const nudge = (base: number, dir: number) => clamp(base + dir * 0.12 * existing, 0, 1);
  if (group === 'boca') return { at: 1, around: 0 };
  if (kind === 'ocelo') return { at: nudge(0.86, -1), around: Math.PI / 4 };
  if (kind === 'flagelo') return { at: 0, around: clamp(0.5 * existing, -Math.PI, Math.PI) };
  const side = kind === 'aleta' || kind === 'cilios' ? Math.PI / 2 : 0;
  return { at: nudge(0.5, 1), around: side };
}

/** Índice do ponto depois do qual `addPoint` insere: o selecionado (ou o do meio), nunca o último. */
function addPointAfter(state: EditorState): number {
  const n = state.bp.body.spine.length;
  const sel = state.selected?.kind === 'point' ? state.selected.index : Math.floor((n - 1) / 2);
  return Math.min(sel, n - 2);
}

/** Por que `addPoint` seria recusado agora: `'max'` (espinha cheia), `'gap'` (vizinhos perto demais) ou null se cabe. */
export function addPointBlocker(state: EditorState): 'max' | 'gap' | null {
  const spine = state.bp.body.spine;
  if (spine.length >= CATALOG.body.points[1]) return 'max';
  const a = addPointAfter(state);
  if (spine[a + 1][0] - spine[a][0] < 2 * MIN_GAP) return 'gap';
  return null;
}

/** Planta com mais orçamento, tipo ou peças além do permitido? */
function overLimits(bp: Blueprint): boolean {
  const inst = instances(bp);
  let total = 0;
  for (const k of Object.keys(inst) as PartKind[]) {
    total += inst[k];
    if (inst[k] > CATALOG.parts[k].max) return true;
  }
  return total > CATALOG.parts_max || blueprintCost(bp) > CATALOG.budget;
}

/** A peça `index` pode ser espelhada agora (o catálogo deixa e a segunda instância cabe)? */
export function canMirror(bp: Blueprint, index: number): boolean {
  const part = bp.parts[index];
  if (!part || part.mirror || !CATALOG.parts[part.kind].mirror) return false;
  return !overLimits(withPart(bp, index, { mirror: true }));
}

function withPart(bp: Blueprint, index: number, patch: Partial<BlueprintPart>): Blueprint {
  return { ...bp, parts: bp.parts.map((p, i) => (i === index ? { ...p, ...patch } : p)) };
}

function withSpine(bp: Blueprint, spine: Blueprint['body']['spine']): Blueprint {
  return { ...bp, body: { spine } };
}

/** Aceita a planta nova só se ela cabe no orçamento (e no resto dos limites). */
function commit(state: EditorState, bp: Blueprint, selected: Selected = state.selected): EditorState {
  if (overLimits(bp)) return state;
  return { bp, selected };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { bp } = state;
  const spine = bp.body.spine;
  const [rmin, rmax] = CATALOG.body.r;
  switch (action.type) {
    case 'addPart': {
      if (!Object.prototype.hasOwnProperty.call(CATALOG.parts, action.kind)) return state;
      if (nextInstanceCost(bp, action.kind) === null) return state;
      const existing = bp.parts.filter((p) => p.kind === action.kind).length;
      const part: BlueprintPart = { kind: action.kind, ...placement(action.kind, existing), size: 1, angle: 0, mirror: false };
      const parts = [...bp.parts, part];
      return commit(state, { ...bp, parts }, { kind: 'part', index: parts.length - 1 });
    }
    case 'movePart': {
      if (!bp.parts[action.index] || !finite(action.at, action.around)) return state;
      return commit(state, withPart(bp, action.index, { at: clamp(action.at, 0, 1), around: clamp(action.around, -Math.PI, Math.PI) }));
    }
    case 'setPartSize': {
      if (!bp.parts[action.index] || !finite(action.size)) return state;
      const [lo, hi] = CATALOG.part_size;
      return commit(state, withPart(bp, action.index, { size: clamp(action.size, lo, hi) }));
    }
    case 'setPartAngle': {
      if (!bp.parts[action.index] || !finite(action.angle)) return state;
      const [lo, hi] = CATALOG.part_angle;
      return commit(state, withPart(bp, action.index, { angle: clamp(action.angle, lo, hi) }));
    }
    case 'toggleMirror': {
      const part = bp.parts[action.index];
      if (!part) return state;
      if (part.mirror) return commit(state, withPart(bp, action.index, { mirror: false }));
      return canMirror(bp, action.index) ? commit(state, withPart(bp, action.index, { mirror: true })) : state;
    }
    case 'removePart': {
      if (!bp.parts[action.index]) return state;
      return commit(state, { ...bp, parts: bp.parts.filter((_, i) => i !== action.index) }, null);
    }
    case 'movePoint': {
      const i = action.index;
      if (!spine[i] || !finite(action.x, action.y)) return state;
      const n = spine.length;
      let lo = i > 0 ? spine[i - 1][0] + MIN_GAP : -Infinity;
      let hi = i < n - 1 ? spine[i + 1][0] - MIN_GAP : Infinity;
      // Só as pontas mudam o comprimento.
      if (i === 0) lo = Math.max(lo, spine[n - 1][0] - CATALOG.body.length_max);
      if (i === n - 1) hi = Math.min(hi, spine[0][0] + CATALOG.body.length_max);
      if (lo > hi) return state;
      const x = clamp(action.x, lo, hi);
      const y = clamp(action.y, -CATALOG.body.bend_max, CATALOG.body.bend_max);
      return commit(state, withSpine(bp, spine.map((p, k) => (k === i ? [x, y, p[2]] : p))));
    }
    case 'setThickness': {
      const i = action.index;
      if (!spine[i] || !finite(action.r)) return state;
      const r = clamp(action.r, rmin, rmax);
      return commit(state, withSpine(bp, spine.map((p, k) => (k === i ? [p[0], p[1], r] : p))));
    }
    case 'addPoint': {
      if (addPointBlocker(state) !== null) return state;
      const a = addPointAfter(state);
      const p = spine[a];
      const q = spine[a + 1];
      const mid: [number, number, number] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      const next = [...spine.slice(0, a + 1), mid, ...spine.slice(a + 1)];
      return commit(state, withSpine(bp, next), { kind: 'point', index: a + 1 });
    }
    case 'removePoint': {
      if (state.selected?.kind !== 'point') return state;
      const i = state.selected.index;
      if (!spine[i] || spine.length <= CATALOG.body.points[0]) return state;
      return commit(state, withSpine(bp, spine.filter((_, k) => k !== i)), null);
    }
    case 'setColor': {
      const hex = action.hex.toLowerCase();
      if (!COLOR.test(hex) || bp.colors[action.which] === hex) return state;
      return commit(state, { ...bp, colors: { ...bp.colors, [action.which]: hex } });
    }
    case 'setPattern': {
      if (!CATALOG.patterns.includes(action.pattern) || bp.pattern === action.pattern) return state;
      return commit(state, { ...bp, pattern: action.pattern });
    }
    case 'select': {
      const s = action.selected;
      if (s === null) return state.selected === null ? state : { bp, selected: null };
      const ok = s.kind === 'point' ? Boolean(spine[s.index]) : Boolean(bp.parts[s.index]);
      if (!ok) return state;
      if (state.selected?.kind === s.kind && state.selected.index === s.index) return state;
      return { bp, selected: { kind: s.kind, index: s.index } };
    }
  }
}
