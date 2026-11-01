import { parseQuality, QUALITY } from './quality';

it('lê low', () => expect(parseQuality('?quality=low')).toBe('low'));
it('padrão high quando ausente', () => expect(parseQuality('')).toBe('high'));
it('padrão high quando inválido', () => expect(parseQuality('?quality=ultra')).toBe('high'));
it('low nunca excede high', () => {
  for (const k of ['maxDpr', 'particleCount', 'tuftCount', 'rockCount'] as const)
    expect(QUALITY.low[k]).toBeLessThanOrEqual(QUALITY.high[k]);
});
it('segmentos do Filamento e grânulos da Célula por perfil', () => {
  expect(QUALITY.high.filamentoSegments).toBe(90);
  expect(QUALITY.low.filamentoSegments).toBe(48);
  expect(QUALITY.high.celulaGranules).toBe(14);
  expect(QUALITY.low.celulaGranules).toBe(8);
});
it('resolução do leito por bloco', () => {
  expect(QUALITY.high.seabedSegments).toBe(64);
  expect(QUALITY.low.seabedSegments).toBe(40);
});
