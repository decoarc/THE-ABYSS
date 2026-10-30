import { createRng } from './random';

it('é determinístico por semente', () => {
  const a = createRng(42), b = createRng(42);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
it('fica em [0,1)', () => {
  const r = createRng(7);
  for (let i = 0; i < 10000; i++) {
    const v = r();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});
it('sementes diferentes divergem', () => expect(createRng(1)()).not.toBe(createRng(2)()));
