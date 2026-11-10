import * as THREE from 'three';
import fixtures from '../../../../shared/genesis/fixtures/blueprints.json';
import { createRng } from '../lib/random';
import type { Blueprint, BlueprintPart, PartKind } from '../services/wire';
import { bodyRadius, CATALOG, INITIAL_BLUEPRINT, validateBlueprint } from './blueprint';
import { buildBodyGeometry, buildPartsGeometry, geometryCache, PART_KINDS, surfaceCoords, surfaceFrame } from './geometry';

const valid = (fixtures as unknown as { blueprint: unknown }[])
  .map((f) => f.blueprint)
  .filter((b) => validateBlueprint(b).length === 0) as Blueprint[];

/** Raio sem o limite de `body.radius`: o corpo de verdade não é cortado pelo limite. */
function rawRadius(bp: Blueprint): number {
  const s = bp.body.spine;
  const cx = s.reduce((a, p) => a + p[0], 0) / s.length;
  const cy = s.reduce((a, p) => a + p[1], 0) / s.length;
  return Math.max(...s.map(([x, y, r]) => Math.hypot(x - cx, y - cy) + r));
}

/** Planta "Random-like": espinha e peças sorteadas nas faixas do catálogo (sem conferir orçamento). */
function randomBlueprint(rng: () => number): Blueprint {
  const n = 3 + Math.floor(rng() * 4);
  const length = 0.3 + rng() * (CATALOG.body.length_max - 0.3);
  const [rmin, rmax] = CATALOG.body.r;
  const spine: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + (length * i) / (n - 1);
    const y = (rng() * 2 - 1) * CATALOG.body.bend_max * 0.6;
    spine.push([x, y, rmin + rng() * (rmax - rmin)]);
  }
  const kinds = Object.keys(CATALOG.parts) as PartKind[];
  const parts: BlueprintPart[] = [];
  const count = Math.floor(rng() * 9);
  for (let i = 0; i < count; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    parts.push({
      kind,
      at: rng(),
      around: (rng() * 2 - 1) * Math.PI,
      size: CATALOG.part_size[0] + rng() * (CATALOG.part_size[1] - CATALOG.part_size[0]),
      angle: CATALOG.part_angle[0] + rng() * (CATALOG.part_angle[1] - CATALOG.part_angle[0]),
      mirror: CATALOG.parts[kind].mirror && rng() < 0.6,
    });
  }
  const patterns = CATALOG.patterns as Blueprint['pattern'][];
  return {
    v: 1,
    body: { spine },
    parts,
    colors: { glow: '#7fe9dd', body: '#3f5a4a' },
    pattern: patterns[Math.floor(rng() * patterns.length)],
  };
}

const kindCount = (g: THREE.BufferGeometry, k: number) => {
  const a = g.getAttribute('aKind');
  let n = 0;
  for (let i = 0; i < a.count; i++) if (a.getX(i) === k) n++;
  return n;
};

it('tipos na ordem do catálogo', () => {
  expect([...PART_KINDS]).toEqual(Object.keys(CATALOG.parts));
});

it('corpo cobre a espinha', () => {
  const bps = [INITIAL_BLUEPRINT, ...valid].filter((bp) => {
    const raw = rawRadius(bp);
    return raw >= CATALOG.body.radius[0] && raw <= CATALOG.body.radius[1];
  });
  expect(bps.length).toBeGreaterThan(3);
  for (const bp of bps) {
    const g = buildBodyGeometry(bp);
    const r = g.boundingSphere!.radius;
    expect(Math.abs(r - bodyRadius(bp)) / bodyRadius(bp)).toBeLessThan(0.05);
    expect(g.getAttribute('aAlong')).toBeDefined();
    expect(g.getAttribute('aAround')).toBeDefined();
  }
});

it('espelho gera peça simétrica', () => {
  const part: BlueprintPart = { kind: 'aleta', at: 0.4, around: 1.2, size: 1.1, angle: 0.3, mirror: false };
  const bp = (p: BlueprintPart): Blueprint => ({ ...INITIAL_BLUEPRINT, parts: [p] });
  const k = PART_KINDS.indexOf('aleta');
  const one = buildPartsGeometry(bp(part));
  const two = buildPartsGeometry(bp({ ...part, mirror: true }));
  const n = kindCount(one, k);
  expect(n).toBeGreaterThan(0);
  expect(kindCount(two, k)).toBe(2 * n);
  // Cada vértice tem um par com x trocado de sinal.
  const pos = two.getAttribute('position');
  const key = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
  const set = new Set<string>();
  for (let i = 0; i < pos.count; i++) set.add(key(pos.getX(i), pos.getY(i), pos.getZ(i)));
  let mirrored = 0;
  for (let i = 0; i < pos.count; i++) if (set.has(key(-pos.getX(i), pos.getY(i), pos.getZ(i)))) mirrored++;
  expect(mirrored).toBe(pos.count);
  // E a peça não é simétrica sozinha (senão o teste não diz nada).
  const p1 = one.getAttribute('position');
  let self = 0;
  const set1 = new Set<string>();
  for (let i = 0; i < p1.count; i++) set1.add(key(p1.getX(i), p1.getY(i), p1.getZ(i)));
  for (let i = 0; i < p1.count; i++) if (set1.has(key(-p1.getX(i), p1.getY(i), p1.getZ(i)))) self++;
  expect(self).toBeLessThan(p1.count);
});

it('surfaceCoords inverte surfaceFrame', () => {
  const rng = createRng(12);
  const bps = [INITIAL_BLUEPRINT, ...valid];
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const bp = bps[i % bps.length];
    const at = rng();
    const around = (rng() * 2 - 1) * Math.PI * 0.999;
    const f = surfaceFrame(bp, at, around);
    const back = surfaceCoords(bp, f.position);
    let da = Math.abs(back.around - around);
    da = Math.min(da, Math.PI * 2 - da);
    worst = Math.max(worst, Math.abs(back.at - at), da);
  }
  expect(worst).toBeLessThan(0.02);
});

it('surfaceFrame: topo em +z, lado direito em +x, frente em +y', () => {
  const bp = INITIAL_BLUEPRINT;
  const top = surfaceFrame(bp, 0.5, 0);
  expect(top.normal.z).toBeGreaterThan(0.99);
  expect(top.tangent.y).toBeGreaterThan(0.99);
  const right = surfaceFrame(bp, 0.5, Math.PI / 2);
  expect(right.normal.x).toBeGreaterThan(0.99);
  expect(right.position.x).toBeCloseTo(0.45, 2);
});

it('plantas diferentes, contagem de vértices finita', () => {
  const rng = createRng(7);
  for (let i = 0; i < 100; i++) {
    const bp = randomBlueprint(rng);
    const body = buildBodyGeometry(bp);
    const parts = buildPartsGeometry(bp);
    const total = body.getAttribute('position').count + parts.getAttribute('position').count;
    expect(total).toBeLessThan(20000);
    for (const g of [body, parts]) {
      const p = g.getAttribute('position').array as Float32Array;
      expect(p.every(Number.isFinite)).toBe(true);
    }
    for (const name of ['aKind', 'aT', 'aPhase']) expect(parts.getAttribute(name)).toBeDefined();
  }
});

it('cache: mesma planta, mesma geometria; descarta quando ninguém usa', () => {
  const bp = { ...INITIAL_BLUEPRINT, pattern: 'aneis' as const };
  const a = geometryCache.acquire(bp);
  const b = geometryCache.acquire(JSON.parse(JSON.stringify(bp)) as Blueprint);
  expect(b.body).toBe(a.body);
  let disposed = 0;
  a.body.addEventListener('dispose', () => disposed++);
  a.parts.addEventListener('dispose', () => disposed++);
  geometryCache.release(bp);
  expect(disposed).toBe(0);
  geometryCache.release(bp);
  expect(disposed).toBe(2);
  expect(geometryCache.acquire(bp).body).not.toBe(a.body);
  geometryCache.release(bp);
});
