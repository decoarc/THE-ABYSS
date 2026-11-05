import { describe, expect, it } from 'vitest';
import { FLY_PATH_LAP_S, flyPathPose, isFlyPathEnabled } from './flyPath';
import { MAP, edgeDepth, regionAt, type RegionId } from '../world/map';
import type { Vec3 } from '../services/wire';

const pose = (t: number) => {
  const out = { pos: [0, 0, 0] as Vec3, lookAt: [0, 0, 0] as Vec3 };
  return flyPathPose(t, out);
};

/** Amostras de uma volta inteira, a cada 0,1 s. */
const lap = () => Array.from({ length: Math.ceil(FLY_PATH_LAP_S * 10) }, (_, i) => pose(i / 10));

describe('flyPath', () => {
  it('só liga com ?flypath=1', () => {
    expect(isFlyPathEnabled('?flypath=1')).toBe(true);
    expect(isFlyPathEnabled('?debug=1&flypath=1')).toBe(true);
    expect(isFlyPathEnabled('')).toBe(false);
    expect(isFlyPathEnabled('?flypath=0')).toBe(false);
  });

  it('é determinístico e dá a volta', () => {
    expect(pose(12.3)).toEqual(pose(12.3));
    const a = pose(5);
    const b = pose(5 + FLY_PATH_LAP_S);
    for (let i = 0; i < 3; i++) {
      expect(b.pos[i]).toBeCloseTo(a.pos[i], 6);
      expect(b.lookAt[i]).toBeCloseTo(a.lookAt[i], 6);
    }
  });

  it('anda sem saltos, num ritmo de nado', () => {
    const samples = lap();
    for (let i = 1; i < samples.length; i++) {
      const [p, q] = [samples[i - 1].pos, samples[i].pos];
      // 0,1 s a no máximo ~1,5 × a velocidade máxima do nado (6 u/s).
      expect(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])).toBeLessThan(0.9);
    }
  });

  it('fica dentro do mapa, sempre olhando para a frente', () => {
    for (const { pos, lookAt } of lap()) {
      // A faixa entre o Jardim e a Floresta tem no máximo ~1,7 de profundidade.
      expect(edgeDepth(pos[0], pos[2])).toBeGreaterThan(0.5);
      expect(Math.hypot(lookAt[0] - pos[0], lookAt[2] - pos[2])).toBeGreaterThan(1);
    }
  });

  it('passa pelas três regiões, pelas duas transições e por dentro das esponjas', () => {
    const regions = lap().map(({ pos }) => regionAt(pos[0], pos[2]));
    expect(new Set(regions)).toEqual(new Set<RegionId>(['jardim', 'floresta', 'planicie']));
    const crossings = new Set<string>();
    for (let i = 1; i < regions.length; i++) {
      if (regions[i] !== regions[i - 1]) crossings.add([regions[i - 1], regions[i]].sort().join('-'));
    }
    expect(crossings).toEqual(new Set(['floresta-jardim', 'jardim-planicie']));
    const inside = lap().filter(({ pos }) => MAP.sponges.some((s) => Math.hypot(pos[0] - s.x, pos[2] - s.z) < s.r));
    expect(inside.length).toBeGreaterThan(0);
  });
});
