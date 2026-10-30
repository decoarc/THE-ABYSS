import { parseQuality, QUALITY } from './quality';

it('lê low', () => expect(parseQuality('?quality=low')).toBe('low'));
it('padrão high quando ausente', () => expect(parseQuality('')).toBe('high'));
it('padrão high quando inválido', () => expect(parseQuality('?quality=ultra')).toBe('high'));
it('low nunca excede high', () => {
  for (const k of ['maxDpr', 'particleCount', 'tuftCount', 'rockCount'] as const)
    expect(QUALITY.low[k]).toBeLessThanOrEqual(QUALITY.high[k]);
});
