export type QualityLevel = 'high' | 'low';

export interface QualitySettings {
  maxDpr: number;
  particleCount: number;
  sporeCount: number;
  tuftCount: number;
  rockCount: number;
  postprocessing: boolean;
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: { maxDpr: 1.5, particleCount: 1500, sporeCount: 160, tuftCount: 600, rockCount: 120, postprocessing: true },
  low: { maxDpr: 1, particleCount: 400, sporeCount: 60, tuftCount: 200, rockCount: 50, postprocessing: true },
};

export function parseQuality(search: string): QualityLevel {
  const value = new URLSearchParams(search).get('quality');
  return value === 'low' ? 'low' : 'high';
}
