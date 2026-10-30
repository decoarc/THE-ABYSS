/**
 * Configuração de cada criatura. Um único conjunto de valores por espécie por
 * enquanto; a forma de objeto é preparação para o gerador futuro (atributos → visual).
 */

export interface NucleusConfig {
  color: string;
  radius: number;
  pulseHz: number;
  pulseMin: number;
  pulseMax: number;
}

/** Senoide suavizada (smoothstep) em [pulseMin, pulseMax]: demora nos extremos, como uma respiração. */
export function nucleusPulse(t: number, n: NucleusConfig): number {
  const s = 0.5 - 0.5 * Math.cos(2 * Math.PI * n.pulseHz * t);
  const smooth = s * s * (3 - 2 * s);
  return n.pulseMin + (n.pulseMax - n.pulseMin) * smooth;
}

export interface MembranaConfig {
  nucleus: NucleusConfig;
  radius: number;
  /** Amplitude da deformação por ruído, relativa ao raio. */
  wobble: number;
  /** Espessura aparente da borda (expoente do Fresnel). */
  thickness: number;
  driftRadius: number;
  /** Velocidade angular da órbita em rad/s. */
  driftSpeed: number;
}

export const MEMBRANA: MembranaConfig = {
  nucleus: { color: '#c4f7ef', radius: 0.26, pulseHz: 0.16, pulseMin: 1.4, pulseMax: 3.2 },
  radius: 1.35,
  wobble: 0.14,
  thickness: 2.4,
  driftRadius: 4.6,
  driftSpeed: 0.045,
};
