export interface PulseParams {
  /** Velocidade dos pulsos, em comprimentos de corpo (u) por segundo. */
  speed: number;
  /** Distância em u entre pulsos consecutivos. */
  spacing: number;
  /** Largura de cada pulso em u. */
  width: number;
}

/**
 * Trem de pulsos gaussianos ao longo do corpo (u = 0 na cabeça, 1 na cauda),
 * andando para a cauda. Mesma fórmula no shader do Filamento.
 */
export function travelingPulse(u: number, t: number, p: PulseParams): number {
  const phase = (((u - t * p.speed) % p.spacing) + p.spacing) % p.spacing;
  const d = Math.min(phase, p.spacing - phase) / p.width;
  return Math.exp(-d * d);
}
