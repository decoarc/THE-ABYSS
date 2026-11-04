import { MAP } from '../../world/map';
import { SPONGE_BUCKETS, bucketOf, latticeGeometry, placeSponge } from './latticeGen';

const shapes = [
  { r: 0.8, h: 2.5 },
  { r: 1.4, h: 4 },
  { r: 2.2, h: 6 },
];

describe('latticeGeometry', () => {
  it.each(shapes)('casca externa dentro do cilindro r $r × h $h', (shape) => {
    for (const detail of [1, 0.6]) {
      const pos = latticeGeometry(shape, detail).getAttribute('position');
      expect(pos.count).toBeGreaterThan(0);
      for (let i = 0; i < pos.count; i++) {
        expect(Math.hypot(pos.getX(i), pos.getZ(i))).toBeLessThanOrEqual(shape.r + 1e-9);
        expect(pos.getY(i)).toBeGreaterThanOrEqual(-1e-9);
        expect(pos.getY(i)).toBeLessThanOrEqual(shape.h + 1e-9);
      }
    }
  });

  it('a casca chega perto da parede do cilindro (cesto largo, não um fio no meio)', () => {
    const shape = { r: 2, h: 4 };
    const pos = latticeGeometry(shape, 1).getAttribute('position');
    let widest = 0;
    for (let i = 0; i < pos.count; i++) widest = Math.max(widest, Math.hypot(pos.getX(i), pos.getZ(i)));
    expect(widest).toBeGreaterThan(shape.r * 0.95);
  });

  it('detail menor produz menos vértices', () => {
    for (const shape of shapes) {
      const hi = latticeGeometry(shape, 1).getAttribute('position').count;
      const lo = latticeGeometry(shape, 0.6).getAttribute('position').count;
      expect(lo).toBeLessThan(hi);
    }
  });

  it('determinística', () => {
    const a = latticeGeometry({ r: 1.5, h: 4 }, 1).getAttribute('position').array;
    const b = latticeGeometry({ r: 1.5, h: 4 }, 1).getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('esponjas do mapa no lugar do servidor', () => {
  it('toda esponja cai num balde cujo raio a cobre', () => {
    for (const sp of MAP.sponges) {
      const b = SPONGE_BUCKETS[bucketOf(sp)];
      expect(b.r).toBeGreaterThanOrEqual(sp.r);
    }
  });

  it('assentada no chão, a casca ocupa o cilindro r × (até y = h) que o servidor usa para desviar', () => {
    for (const sp of MAP.sponges) {
      const b = SPONGE_BUCKETS[bucketOf(sp)];
      const floor = -0.3;
      const p = placeSponge(sp, floor);
      // A base afunda um pouco no chão; o topo é exatamente o topo do cilindro do servidor.
      expect(p.baseY).toBeLessThan(floor);
      expect(p.baseY + p.scaleY * b.h).toBeCloseTo(sp.h, 9);
      expect(p.scaleXZ * b.r).toBeCloseTo(sp.r, 9);
      expect(p.scaleY).toBeGreaterThan(0);
    }
  });
});
