import { DISSOLVE_MS, type Vitals } from '../services/worldStore';
import { GROW_MS, STRETCH_MAX, dissolve, energyGlow, lifeScale, stretch } from './vitals';

const vit = (over: Partial<Vitals> = {}): Vitals => ({
  energy: 1, juvenile: false, dividing: false, maturedAtMs: null, dividingSinceMs: null, dyingSinceMs: null, ...over,
});

describe('energyGlow', () => {
  it('cheio é 1 e meio é 0.675', () => {
    expect(energyGlow(1, 0)).toBe(1);
    expect(energyGlow(1, 7.3)).toBe(1);
    expect(energyGlow(0.5, 3)).toBeCloseTo(0.675, 10);
  });
  it('abaixo de 0.25 oscila, sempre <= base e > 0', () => {
    const e = 0.1;
    const base = 0.35 + 0.65 * e;
    const vs = Array.from({ length: 240 }, (_, i) => energyGlow(e, i * 0.01));
    for (const v of vs) {
      expect(v).toBeLessThanOrEqual(base + 1e-12);
      expect(v).toBeGreaterThan(0);
    }
    expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan(0.05);
    expect(energyGlow(e, 0.4)).toBeCloseTo(energyGlow(e, 0.4 + 2.4), 10);
  });
  it('em 0.25 ou mais não tremeluz', () => {
    expect(energyGlow(0.25, 0)).toBe(energyGlow(0.25, 0.6));
  });
});

describe('lifeScale', () => {
  it('jovem fica no tamanho jovem', () => {
    expect(lifeScale(vit({ juvenile: true }), 5000, 0.45)).toBe(0.45);
  });
  it('cresce suave depois de amadurecer e fecha em 1 aos GROW_MS', () => {
    const v = vit({ maturedAtMs: 1000 });
    expect(lifeScale(v, 1000, 0.45)).toBeCloseTo(0.45, 10);
    const mid = lifeScale(v, 1000 + GROW_MS / 2, 0.45);
    expect(mid).toBeGreaterThan(0.45);
    expect(mid).toBeLessThan(1);
    expect(lifeScale(v, 1000 + GROW_MS, 0.45)).toBe(1);
    expect(lifeScale(v, 1000 + GROW_MS * 3, 0.45)).toBe(1);
  });
  it('adulto desde o início é 1', () => {
    expect(lifeScale(vit(), 123, 0.45)).toBe(1);
  });
});

describe('stretch', () => {
  it('1 fora da divisão', () => {
    expect(stretch(vit(), 9999, 8)).toBe(1);
    expect(stretch(vit({ dividing: true, dividingSinceMs: null }), 9999, 8)).toBe(1);
  });
  it('vai de 1 a 1.8 ao longo de divideS', () => {
    const v = vit({ dividing: true, dividingSinceMs: 1000 });
    expect(stretch(v, 1000, 8)).toBe(1);
    expect(stretch(v, 1000 + 4000, 8)).toBeCloseTo(1.4, 10);
    expect(stretch(v, 1000 + 8000, 8)).toBeCloseTo(STRETCH_MAX, 10);
    expect(stretch(v, 1000 + 20000, 8)).toBeCloseTo(STRETCH_MAX, 10);
    expect(STRETCH_MAX).toBe(1.8);
  });
});

describe('dissolve', () => {
  it('vivo é 1', () => {
    expect(dissolve(vit(), 5000)).toBe(1);
  });
  it('1 na morte, 0 em DISSOLVE_MS, monotônico', () => {
    const v = vit({ dyingSinceMs: 2000 });
    expect(dissolve(v, 2000)).toBe(1);
    expect(dissolve(v, 2000 + DISSOLVE_MS)).toBe(0);
    expect(dissolve(v, 2000 + DISSOLVE_MS * 2)).toBe(0);
    let prev = 1;
    for (let ms = 0; ms <= DISSOLVE_MS; ms += 50) {
      const d = dissolve(v, 2000 + ms);
      expect(d).toBeLessThanOrEqual(prev);
      prev = d;
    }
  });
});
