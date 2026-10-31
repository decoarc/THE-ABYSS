import { CASCO, CELULA, FILAMENTO, MEMBRANA, POLIEDRO, nucleusPulse } from './creatureConfig';

it('pulso fica no intervalo', () => {
  for (let t = 0; t < 20; t += 0.013) {
    const v = nucleusPulse(t, MEMBRANA.nucleus);
    expect(v).toBeGreaterThanOrEqual(MEMBRANA.nucleus.pulseMin);
    expect(v).toBeLessThanOrEqual(MEMBRANA.nucleus.pulseMax);
  }
});
it('pulso tem período 1/pulseHz', () => {
  const n = MEMBRANA.nucleus;
  expect(nucleusPulse(0.3, n)).toBeCloseTo(nucleusPulse(0.3 + 1 / n.pulseHz, n), 6);
});
it('pulso alcança perto dos extremos', () => {
  const n = MEMBRANA.nucleus;
  const vs = Array.from({ length: 1000 }, (_, i) => nucleusPulse(i / (1000 * n.pulseHz), n));
  expect(Math.max(...vs)).toBeCloseTo(n.pulseMax, 2);
  expect(Math.min(...vs)).toBeCloseTo(n.pulseMin, 2);
});
it('núcleos das cinco criaturas distintos', () => {
  const ns = [MEMBRANA, FILAMENTO, CASCO, CELULA, POLIEDRO].map((c) => `${c.nucleus.color}@${c.nucleus.pulseHz}`);
  expect(new Set(ns).size).toBe(5);
});
it('Poliedro maior que o Casco', () => expect(POLIEDRO.radius).toBeGreaterThan(CASCO.radius));
