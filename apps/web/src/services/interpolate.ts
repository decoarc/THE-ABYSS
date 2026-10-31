import type { Vec3 } from './wire';

/**
 * Hermite cúbico entre duas amostras. Tempos em ms, velocidades em u/s.
 * Escreve em `out` (sem alocação) e o devolve.
 */
export function hermite(
  p0: Vec3, v0: Vec3, t0: number,
  p1: Vec3, v1: Vec3, t1: number,
  t: number, out: Vec3,
): Vec3 {
  const span = t1 - t0;
  if (span <= 0) {
    out[0] = p1[0]; out[1] = p1[1]; out[2] = p1[2];
    return out;
  }
  const u = (t - t0) / span;
  const h = span / 1000; // s: converte u/s em deslocamento ao longo do segmento
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  for (let i = 0; i < 3; i++) {
    out[i] = h00 * p0[i] + h10 * h * v0[i] + h01 * p1[i] + h11 * h * v1[i];
  }
  return out;
}
