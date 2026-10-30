import { travelingPulse } from './pulse';

const P = { speed: 0.35, spacing: 0.3, width: 0.06 };

it('fica em [0,1]', () => {
  for (let u = 0; u <= 1; u += 0.01)
    for (let t = 0; t < 5; t += 0.1) {
      const v = travelingPulse(u, t, P);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
});
it('pulso anda em direção à cauda', () => {
  const peak = (t: number) => {
    let best = 0, at = 0;
    for (let u = 0; u <= P.spacing; u += 0.001) {
      const v = travelingPulse(u, t, P);
      if (v > best) { best = v; at = u; }
    }
    return at;
  };
  expect(peak(0.2)).toBeGreaterThan(peak(0.1));
});
it('periódico no espaço', () => expect(travelingPulse(0.1, 1, P)).toBeCloseTo(travelingPulse(0.1 + P.spacing, 1, P), 6));
it('pico chega a 1', () => {
  let best = 0;
  for (let u = 0; u <= 1; u += 0.0005) best = Math.max(best, travelingPulse(u, 0.7, P));
  expect(best).toBeCloseTo(1, 2);
});
