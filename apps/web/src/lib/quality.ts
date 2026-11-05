export type QualityLevel = 'high' | 'low';

export interface QualitySettings {
  maxDpr: number;
  particleCount: number;
  tuftCount: number;
  rockCount: number;
  postprocessing: boolean;
  /** Poliedro com material de cristal (transmissão); caro em GPU integrada. */
  crystal: boolean;
  /** Amostras do corpo do Filamento (o comprimento do corpo não muda com o perfil). */
  filamentoSegments: number;
  /** Grânulos dentro de cada Célula. */
  celulaGranules: number;
  /** Divisões por lado de cada bloco 30 × 30 do leito. */
  seabedSegments: number;
  /** Hastes com bulbo em cada mancha de flora (o teto de manchas não muda com o perfil). */
  floraStalks: number;
  /** Lados do tapete de cada mancha de flora. */
  floraMatSides: number;
  /** Detalhe da treliça das esponjas da Floresta (fios e amostras por fio, 0–1). */
  spongeDetail: number;
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: {
    maxDpr: 1.5,
    particleCount: 1500,
    tuftCount: 600,
    rockCount: 280,
    postprocessing: true,
    crystal: true,
    filamentoSegments: 90,
    celulaGranules: 14,
    seabedSegments: 64,
    floraStalks: 9,
    floraMatSides: 20,
    spongeDetail: 1,
  },
  low: {
    maxDpr: 1,
    particleCount: 400,
    tuftCount: 200,
    rockCount: 120,
    postprocessing: true,
    crystal: true,
    filamentoSegments: 48,
    celulaGranules: 8,
    seabedSegments: 40,
    floraStalks: 5,
    floraMatSides: 10,
    spongeDetail: 0.6,
  },
};

export function parseQuality(search: string): QualityLevel {
  const value = new URLSearchParams(search).get('quality');
  return value === 'low' ? 'low' : 'high';
}
