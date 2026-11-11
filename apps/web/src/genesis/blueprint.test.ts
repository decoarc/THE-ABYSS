import fixtures from '../../../../shared/genesis/fixtures/blueprints.json';
import type { Blueprint, PartKind } from '../services/wire';
import {
  blueprintCost, bodyRadius, CATALOG, INITIAL_BLUEPRINT, instances, nextInstanceCost, previewTraits, validateBlueprint,
} from './blueprint';

interface Fx {
  name: string;
  blueprint: unknown;
  valid: boolean;
  cost: number | null;
  traits: Record<string, number | boolean | string> | null;
  error?: string;
}

it('fixtures: validade, custo e características batem com o servidor', () => {
  const cases = fixtures as unknown as Fx[];
  expect(cases.length).toBe(22);
  for (const c of cases) {
    const errors = validateBlueprint(c.blueprint);
    if (!c.valid) {
      expect(errors.length, c.name).toBeGreaterThan(0);
      if (c.error) expect(errors, c.name).toContain(c.error);
      continue;
    }
    expect(errors, c.name).toEqual([]);
    const bp = c.blueprint as Blueprint;
    expect(blueprintCost(bp), c.name).toBe(c.cost);
    const t = previewTraits(bp) as unknown as Record<string, number | boolean | string>;
    for (const [k, v] of Object.entries(c.traits!)) {
      if (typeof v === 'number') expect(t[k] as number, `${c.name}.${k}`).toBeCloseTo(v, 9);
      else expect(t[k], `${c.name}.${k}`).toBe(v);
    }
    expect(t.wander).toBe(CATALOG.base.wander);
  }
});

it('lixo nunca valida nem quebra', () => {
  const junk: unknown[] = [
    null, undefined, 1, 'x', [], {}, { v: 1 }, () => 1, 10n,
    { v: 1, body: null, parts: null, colors: null, pattern: null },
  ];
  const cyc: Record<string, unknown> = {};
  cyc.self = cyc;
  junk.push(
    cyc,
    { ...INITIAL_BLUEPRINT, parts: 'x' },
    { ...INITIAL_BLUEPRINT, body: { spine: [[NaN, 0, 0.3], [1, 0, 0.3], [2, 0, 0.3]] } },
  );
  for (const j of junk) expect(validateBlueprint(j).length).toBeGreaterThan(0);
  const big = { ...INITIAL_BLUEPRINT, parts: new Array(5000).fill({ kind: 'flagelo' }) };
  expect(validateBlueprint(big)).toEqual(['planta grande demais']);
});

const withParts = (parts: Blueprint['parts']): Blueprint => ({ ...INITIAL_BLUEPRINT, parts });
const part = (kind: PartKind, mirror = false) => ({ kind, at: 0.5, around: 0.5, size: 1, angle: 0, mirror });

it('núcleo inicial: raio 0.65 e custo 3', () => {
  expect(bodyRadius(INITIAL_BLUEPRINT)).toBeCloseTo(0.65, 9);
  expect(blueprintCost(INITIAL_BLUEPRINT)).toBe(3);
  expect(instances(INITIAL_BLUEPRINT).flagelo).toBe(0);
});

it('nextInstanceCost respeita max, espelho e orçamento', () => {
  // A próxima instância custa cost + step × n (flagelo 3, 4, 5, 6).
  expect(nextInstanceCost(INITIAL_BLUEPRINT, 'flagelo')).toBe(3);
  expect(nextInstanceCost(withParts([part('flagelo')]), 'flagelo')).toBe(4);
  // Espelhada conta 2 instâncias: a próxima é a terceira.
  expect(nextInstanceCost(withParts([part('flagelo', true)]), 'flagelo')).toBe(5);
  // Quatro instâncias é o máximo.
  const cheio = withParts([part('flagelo', true), part('flagelo', true)]);
  expect(nextInstanceCost(cheio, 'flagelo')).toBeNull();
  // Boca: só uma, de qualquer tipo.
  expect(nextInstanceCost(INITIAL_BLUEPRINT, 'raspador')).toBe(2);
  const boca = withParts([part('raspador')]);
  expect(nextInstanceCost(boca, 'mandibula')).toBeNull();
  expect(nextInstanceCost(boca, 'raspador')).toBeNull();
  // Orçamento: corpo 3 + flagelos 3+4+5+6 = 21; sobram 3.
  const quase = withParts([part('flagelo', true), part('flagelo', true)]);
  expect(blueprintCost(quase)).toBe(21);
  expect(nextInstanceCost(quase, 'mandibula')).toBeNull();
  expect(nextInstanceCost(quase, 'raspador')).toBe(2);
  expect(nextInstanceCost(quase, 'placa')).toBe(3);
  expect(nextInstanceCost(quase, 'ocelo')).toBe(2);
  // parts_max (14 instâncias): 4 cílios + 4 aletas + 4 ocelos + 2 placas = 14, sem custo para o teste de teto.
  const quatorze = withParts([
    part('cilios', true), part('cilios', true), part('aleta', true), part('aleta', true),
    part('ocelo', true), part('ocelo', true), part('placa', true),
  ]);
  expect(Object.values(instances(quatorze)).reduce((a, b) => a + b, 0)).toBe(14);
  expect(nextInstanceCost(quatorze, 'cardume')).toBeNull();
  expect(nextInstanceCost(INITIAL_BLUEPRINT, 'inexistente' as PartKind)).toBeNull();
});
