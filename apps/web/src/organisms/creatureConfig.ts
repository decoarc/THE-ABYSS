import type { LissajousParams } from './paths';
import type { PulseParams } from './pulse';

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
  nucleus: { color: '#7fe9dd', radius: 0.13, pulseHz: 0.16, pulseMin: 1.05, pulseMax: 1.9 },
  radius: 1.05,
  wobble: 0.14,
  thickness: 2.4,
  driftRadius: 4.6,
  driftSpeed: 0.045,
};

export interface FilamentoConfig {
  nucleus: NucleusConfig;
  path: LissajousParams;
  /** Amostras do corpo, da cabeça à cauda. */
  segments: number;
  /** Atraso, em segundos de trajeto, entre amostras consecutivas do corpo. */
  lag: number;
  width: number;
  /** Achatamento da seção (1 = tubo, < 1 = fita). */
  flatness: number;
  undulation: number;
  /** Pulsos de luz correndo da cabeça até a cauda. */
  pulses: PulseParams;
}

export const FILAMENTO: FilamentoConfig = {
  nucleus: { color: '#86f4ec', radius: 0.17, pulseHz: 0.42, pulseMin: 2.2, pulseMax: 3.6 },
  path: { ax: 8.5, ay: 1.1, az: 2.6, fx: 0.019, fy: 0.047, fz: 0.031, center: [0, 3.8, 4.4] },
  segments: 90,
  lag: 0.045,
  width: 0.42,
  flatness: 0.22,
  undulation: 0.3,
  pulses: { speed: 0.35, spacing: 0.3, width: 0.06 },
};

export interface CascoConfig {
  nucleus: NucleusConfig;
  radius: number;
  /** Quanto cada face encolhe para o próprio centro (1 = sem fresta). */
  faceShrink: number;
  position: [number, number, number];
  /** Intervalo, em segundos, entre "ajustes" bruscos. */
  adjustEvery: [number, number];
  adjustDuration: number;
}

export const CASCO: CascoConfig = {
  nucleus: { color: '#c9a2ff', radius: 0.32, pulseHz: 0.09, pulseMin: 1.6, pulseMax: 3.0 },
  radius: 0.95,
  faceShrink: 0.86,
  position: [5.4, 4.9, -5.2],
  adjustEvery: [6, 12],
  adjustDuration: 0.55,
};

export interface CelulaConfig {
  nucleus: NucleusConfig;
  /** Comprimento total da cápsula. */
  length: number;
  radius: number;
  granules: number;
  flagella: number;
  /** Pontas do trajeto de vai e volta. */
  from: [number, number, number];
  to: [number, number, number];
  /** Velocidade máxima no trajeto, em unidades/s. */
  speed: number;
  /** Tempo parada numa ponta, virando para voltar. */
  turnSeconds: number;
  /** Rolagem em torno do próprio eixo, rad/s. */
  rollSpeed: number;
}

export const CELULA: CelulaConfig = {
  nucleus: { color: '#d4ec7a', radius: 0.15, pulseHz: 0.25, pulseMin: 1.4, pulseMax: 2.6 },
  length: 1.6,
  radius: 0.38,
  granules: 14,
  flagella: 3,
  from: [-7.5, 2.4, 1.5],
  to: [-2.5, 2.9, 5.5],
  speed: 0.35,
  turnSeconds: 3,
  rollSpeed: 0.6,
};

export interface PoliedroConfig {
  nucleus: NucleusConfig;
  radius: number;
  position: [number, number, number];
  /** Eixo fixo do giro (normalizado no componente). */
  spinAxis: [number, number, number];
  /** Velocidade angular constante, rad/s. */
  spinSpeed: number;
  /** Amplitude do sobe e desce lento. */
  bob: number;
}

export const POLIEDRO: PoliedroConfig = {
  nucleus: { color: '#a8c8ff', radius: 0.3, pulseHz: 0.12, pulseMin: 1.5, pulseMax: 2.8 },
  radius: 1.2,
  position: [-5.5, 5.4, -4.5],
  spinAxis: [0.3, 1, 0.15],
  spinSpeed: 0.18,
  bob: 0.25,
};
