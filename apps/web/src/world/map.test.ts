import { describe, expect, it } from 'vitest';
import { MAP, edgeDepth, inward, regionAt, regionWeights } from './map';

describe('mapa compartilhado', () => {
  it('carrega 3 regiões com raio entre 20 e 50', () => {
    expect(MAP.regions).toHaveLength(3);
    for (const r of MAP.regions) {
      expect(r.radius).toBeGreaterThanOrEqual(20);
      expect(r.radius).toBeLessThanOrEqual(50);
    }
  });

  it('edgeDepth', () => {
    expect(edgeDepth(0, 0)).toBe(30);
    expect(edgeDepth(62, -28)).toBe(45);
    expect(edgeDepth(200, 200)).toBeLessThan(0);
  });

  it('regionAt', () => {
    expect(regionAt(0, 0)).toBe('jardim');
    expect(regionAt(62, -28)).toBe('planicie');
    expect(regionAt(-48, -30)).toBe('floresta');
  });

  it('inward aponta para dentro e é unitário', () => {
    const [dx, dz] = inward(100, -28);
    expect(dx).toBeLessThan(0);
    expect(Math.hypot(dx, dz)).toBeCloseTo(1, 9);
  });

  it('regionWeights somam 1 e o Jardim vale 1 em (0, 0)', () => {
    for (const [x, z] of [[0, 0], [30, -10], [-48, -30], [62, -28], [200, 200], [-20, -15]]) {
      const w = regionWeights(x, z);
      expect(w.jardim + w.floresta + w.planicie).toBeCloseTo(1, 9);
    }
    expect(regionWeights(0, 0).jardim).toBeCloseTo(1, 9);
  });

  it('esponjas dentro da Floresta', () => {
    expect(MAP.sponges.length).toBeGreaterThan(0);
    for (const s of MAP.sponges) expect(regionAt(s.x, s.z)).toBe('floresta');
  });
});
