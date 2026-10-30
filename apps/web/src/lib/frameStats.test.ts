import { percentile } from './frameStats';

it('p50 de 1..100', () => expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 50)).toBeCloseTo(50.5));
it('p95', () => expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95)).toBeCloseTo(95.05));
it('vazio é NaN', () => expect(percentile([], 50)).toBeNaN());
it('não muta a entrada', () => {
  const a = [3, 1, 2];
  percentile(a, 50);
  expect(a).toEqual([3, 1, 2]);
});
it('um único valor', () => expect(percentile([7], 95)).toBe(7));
