import { Color } from 'three';
import { PALETTE } from '../lib/palette';
import { MAP, regionWeights, type RegionId } from '../world/map';
import { JARDIM_CORE, JARDIM_FADE } from './terrain';

/** Névoa (e fundo), céu da luz hemisférica e intensidade da luz ambiente num ponto do mapa. */
export interface RegionTint {
  fog: Color;
  sky: Color;
  ambient: number;
}

interface TintDef {
  fog: Color;
  sky: Color;
  ambient: number;
}

const def = (fog: string, sky: string, ambient: number): TintDef => ({
  fog: new Color(fog),
  sky: new Color(sky),
  ambient,
});

/** Jardim: os valores aprovados no gate I (ART_DIRECTION, "Luz" e "Névoa"). */
const JARDIM = def(PALETTE.bg, '#2c6f80', 0.5);

const TINTS: Record<RegionId, TintDef> = {
  jardim: JARDIM,
  // Até a arte da Floresta (Task 11), ela usa a luz do Jardim.
  floresta: JARDIM,
  // "Neve silenciosa": água mais escura e mais fria; quem acende o chão é a comida.
  planicie: def('#01060d', '#1a4560', 0.3),
};

/** Largura (profundidade de borda) da mistura das cores: a mesma do leito, para a luz mudar junto com o chão. */
export const TINT_BLEND = 5;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 no miolo aprovado do Jardim, 1 a partir do fim da passagem do leito: nada lá dentro muda. */
export const outsideJardimCore = (x: number, z: number): number =>
  smoothstep(JARDIM_CORE, JARDIM_CORE + JARDIM_FADE, Math.hypot(x, z));

/** Quanto (0–1) o ponto é Planície, para o leito e a neve; zero no miolo do Jardim. */
export function planicieWeight(x: number, z: number): number {
  const out = outsideJardimCore(x, z);
  return out === 0 ? 0 : regionWeights(x, z, TINT_BLEND).planicie * out;
}

/**
 * Luz e névoa misturadas pelos pesos das regiões em (x, z). Lido a cada quadro na posição da câmera:
 * só muda valores, nunca a quantidade de luzes. Passe `out` para não alocar.
 */
export function regionTint(
  x: number,
  z: number,
  out: RegionTint = { fog: new Color(), sky: new Color(), ambient: 0 },
): RegionTint {
  out.fog.copy(JARDIM.fog);
  out.sky.copy(JARDIM.sky);
  out.ambient = JARDIM.ambient;
  const k = outsideJardimCore(x, z);
  if (k === 0) return out;

  const w = regionWeights(x, z, TINT_BLEND);
  let fr = 0, fg = 0, fb = 0, sr = 0, sg = 0, sb = 0, amb = 0;
  for (const r of MAP.regions) {
    const t = TINTS[r.id];
    const wi = w[r.id];
    fr += t.fog.r * wi;
    fg += t.fog.g * wi;
    fb += t.fog.b * wi;
    sr += t.sky.r * wi;
    sg += t.sky.g * wi;
    sb += t.sky.b * wi;
    amb += t.ambient * wi;
  }
  // Do miolo do Jardim para fora, os valores aprovados cedem à mistura.
  out.fog.setRGB(fr, fg, fb).lerp(JARDIM.fog, 1 - k);
  out.sky.setRGB(sr, sg, sb).lerp(JARDIM.sky, 1 - k);
  out.ambient = JARDIM.ambient + (amb - JARDIM.ambient) * k;
  return out;
}
