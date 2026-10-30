/** Maior passo de tempo aceito por frame; evita saltos ao voltar de uma aba em segundo plano. */
const MAX_DELTA = 0.05;

export function clampDelta(dt: number): number {
  if (!(dt > 0)) return 0;
  return Math.min(dt, MAX_DELTA);
}

export function motionScale(reduced: boolean): number {
  return reduced ? 0.08 : 1;
}
