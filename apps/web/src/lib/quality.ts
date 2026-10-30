export type QualityLevel = 'high' | 'low';

export interface QualitySettings {
  maxDpr: number;
  particleCount: number;
  tuftCount: number;
  rockCount: number;
  postprocessing: boolean;
  /** Poliedro com material de cristal (transmissão); caro em GPU integrada. */
  crystal: boolean;
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: { maxDpr: 1.5, particleCount: 1500, tuftCount: 600, rockCount: 280, postprocessing: true, crystal: true },
  low: { maxDpr: 1, particleCount: 400, tuftCount: 200, rockCount: 120, postprocessing: true, crystal: true },
};

export function parseQuality(search: string): QualityLevel {
  const value = new URLSearchParams(search).get('quality');
  return value === 'low' ? 'low' : 'high';
}
