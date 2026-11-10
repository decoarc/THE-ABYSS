import { CATALOG, INITIAL_BLUEPRINT, blueprintCost, validateBlueprint } from './blueprint';
import { addPointBlocker, canMirror, editorReducer, initialEditorState, type EditorAction, type EditorState } from './editor';

const run = (actions: EditorAction[], from: EditorState = initialEditorState) => actions.reduce(editorReducer, from);

it('começa no núcleo luminoso', () => {
  expect(initialEditorState.bp).toEqual(INITIAL_BLUEPRINT);
  expect(initialEditorState.bp.parts).toEqual([]);
  expect(initialEditorState.selected).toBeNull();
});

it('não deixa passar do orçamento', () => {
  let s = run([{ type: 'addPart', kind: 'mandibula' }]);
  let refused = false;
  for (let i = 0; i < 10; i++) {
    const next = editorReducer(s, { type: 'addPart', kind: 'flagelo' });
    if (next === s) refused = true;
    s = next;
    expect(blueprintCost(s.bp)).toBeLessThanOrEqual(CATALOG.budget);
  }
  expect(refused).toBe(true);
  // Engrossar o corpo também custa: com o orçamento cheio, é recusado.
  const full = s;
  const thick = editorReducer(full, { type: 'setThickness', index: 1, r: CATALOG.body.r[1] });
  expect(blueprintCost(thick.bp)).toBeLessThanOrEqual(CATALOG.budget);
  // Segunda boca não entra.
  expect(editorReducer(full, { type: 'addPart', kind: 'raspador' })).toBe(full);
});

it('limites do corpo', () => {
  const s0 = initialEditorState;
  // x do primeiro ponto não passa do segundo.
  const a = editorReducer(s0, { type: 'movePoint', index: 0, x: 5, y: 0 });
  expect(a.bp.body.spine[0][0]).toBeLessThan(a.bp.body.spine[1][0]);
  // Comprimento nunca passa de length_max.
  const b = run([{ type: 'movePoint', index: 2, x: 10, y: 0 }, { type: 'movePoint', index: 0, x: -10, y: 0 }]);
  const sp = b.bp.body.spine;
  expect(sp[sp.length - 1][0] - sp[0][0]).toBeLessThanOrEqual(CATALOG.body.length_max + 1e-9);
  // Curva limitada.
  const c = editorReducer(s0, { type: 'movePoint', index: 1, x: 0, y: 5 });
  expect(Math.abs(c.bp.body.spine[1][1])).toBeLessThanOrEqual(CATALOG.body.bend_max);
  // Espessura limitada.
  const d = editorReducer(s0, { type: 'setThickness', index: 1, r: 0.01 });
  expect(d.bp.body.spine[1][2]).toBeGreaterThanOrEqual(CATALOG.body.r[0]);
  for (const st of [a, b, c, d]) {
    expect(validateBlueprint({ ...st.bp, parts: [{ kind: 'filtro', at: 1, around: 0, size: 1, angle: 0, mirror: false }] })).toEqual([]);
  }
  // A planta nunca é mutada: arrays novos a cada mudança.
  expect(a.bp.body.spine).not.toBe(s0.bp.body.spine);
  expect(s0.bp.body.spine).toEqual(INITIAL_BLUEPRINT.body.spine);
});

it('espelho só onde o catálogo deixa', () => {
  const mouth = run([{ type: 'addPart', kind: 'raspador' }]);
  expect(canMirror(mouth.bp, 0)).toBe(false);
  expect(editorReducer(mouth, { type: 'toggleMirror', index: 0 })).toBe(mouth);

  const fins = run([{ type: 'addPart', kind: 'aleta' }], mouth);
  expect(canMirror(fins.bp, 1)).toBe(true);
  const mirrored = editorReducer(fins, { type: 'toggleMirror', index: 1 });
  expect(mirrored.bp.parts[1].mirror).toBe(true);
  expect(editorReducer(mirrored, { type: 'toggleMirror', index: 1 }).bp.parts[1].mirror).toBe(false);

  // Espelho que estoura o máximo do tipo (4 aletas) é recusado.
  const four = run([
    { type: 'addPart', kind: 'aleta' },
    { type: 'addPart', kind: 'aleta' },
    { type: 'addPart', kind: 'aleta' },
  ], fins);
  expect(four.bp.parts.filter((p) => p.kind === 'aleta')).toHaveLength(4);
  expect(canMirror(four.bp, 1)).toBe(false);
  expect(editorReducer(four, { type: 'toggleMirror', index: 1 })).toBe(four);
});

it('remover ponto mantém pelo menos 3', () => {
  const s = run([{ type: 'select', selected: { kind: 'point', index: 1 } }, { type: 'removePoint' }]);
  expect(s.bp.body.spine).toHaveLength(3);
  const more = run([{ type: 'select', selected: { kind: 'point', index: 1 } }, { type: 'addPoint' }]);
  expect(more.bp.body.spine).toHaveLength(4);
  const xs = more.bp.body.spine.map((p) => p[0]);
  expect(xs).toEqual([...xs].sort((a, b) => a - b));
  const back = editorReducer(more, { type: 'removePoint' });
  expect(back.bp.body.spine).toHaveLength(3);
  expect(editorReducer(back, { type: 'select', selected: { kind: 'point', index: 0 } }).bp.body.spine).toHaveLength(3);
  const again = run([{ type: 'select', selected: { kind: 'point', index: 0 } }, { type: 'removePoint' }], back);
  expect(again.bp.body.spine).toHaveLength(3);
});

it('peças nascem no lugar do tipo e ficam nas faixas', () => {
  const s = run([
    { type: 'addPart', kind: 'filtro' },
    { type: 'addPart', kind: 'flagelo' },
    { type: 'addPart', kind: 'placa' },
    { type: 'setPartSize', index: 2, size: 99 },
    { type: 'setPartAngle', index: 2, angle: -99 },
    { type: 'movePart', index: 1, at: 7, around: 9 },
  ]);
  expect(s.bp.parts[0].at).toBeGreaterThan(0.9);
  expect(s.bp.parts[2].size).toBe(CATALOG.part_size[1]);
  expect(s.bp.parts[2].angle).toBe(CATALOG.part_angle[0]);
  expect(validateBlueprint(s.bp)).toEqual([]);
  expect(s.selected).toEqual({ kind: 'part', index: 2 });
  const removed = editorReducer({ ...s, selected: { kind: 'part', index: 1 } }, { type: 'removePart', index: 1 });
  expect(removed.bp.parts.map((p) => p.kind)).toEqual(['filtro', 'placa']);
  expect(removed.selected).toBeNull();
});

it('+ ponto usa o mesmo critério do reducer', () => {
  expect(addPointBlocker(initialEditorState)).toBeNull();
  // Ponto 2 a 0,15 do ponto 3: não cabe outro entre eles (precisa de 2 × MIN_GAP).
  const tight = run([
    { type: 'movePoint', index: 1, x: 0.15, y: 0 },
    { type: 'select', selected: { kind: 'point', index: 1 } },
  ]);
  expect(addPointBlocker(tight)).toBe('gap');
  expect(editorReducer(tight, { type: 'addPoint' })).toBe(tight);
  // Espinha cheia.
  let full = run([{ type: 'movePoint', index: 2, x: 2, y: 0 }, { type: 'movePoint', index: 0, x: -1.5, y: 0 }]);
  for (let i = 0; i < 10; i++) full = editorReducer(full, { type: 'addPoint' });
  expect(full.bp.body.spine).toHaveLength(CATALOG.body.points[1]);
  expect(addPointBlocker(full)).toBe('max');
  expect(editorReducer(full, { type: 'addPoint' })).toBe(full);
});
