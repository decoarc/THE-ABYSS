import { Color } from 'three';
import { PALETTE } from '../lib/palette';
import { MAP, regionWeightsInto, type RegionId } from '../world/map';
import { JARDIM_CORE } from './terrain';

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

/** Floresta: névoa índigo quase preta e céu violeta apagado. */
const FLORESTA_FOG = '#070514';
const FLORESTA_SKY = '#3d3170';

/** Jardim: os valores aprovados no gate I (ART_DIRECTION, "Luz" e "Névoa"). */
const JARDIM = def(PALETTE.bg, '#2c6f80', 0.5);

const TINTS: Record<RegionId, TintDef> = {
  jardim: JARDIM,
  // "Treliça": água violeta e mais fechada; a luz que sobra é a presa dentro das esponjas.
  floresta: def(FLORESTA_FOG, FLORESTA_SKY, 0.38),
  // "Neve silenciosa": água mais escura e mais fria; quem acende o chão é a comida.
  planicie: def('#01060d', '#1a4560', 0.3),
};

/** Largura (profundidade de borda) da mistura das cores: a mesma do leito, para a luz mudar junto com o chão. */
export const TINT_BLEND = 5;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Fim da passagem do miolo do Jardim para as outras regiões (luz, névoa, cor do leito, luz da comida e
 * neve). Mais longa que a do relevo (JARDIM_CORE + JARDIM_FADE = 32): a Planície chega aos poucos.
 */
export const REGION_FADE_END = 40;

/** 0 no miolo aprovado do Jardim, 1 a partir de REGION_FADE_END: nada lá dentro muda. */
export const outsideJardimCore = (x: number, z: number): number =>
  smoothstep(JARDIM_CORE, REGION_FADE_END, Math.hypot(x, z));

/** Rascunho dos pesos: as funções abaixo rodam a cada quadro e não alocam. */
const weights: Record<RegionId, number> = { jardim: 0, floresta: 0, planicie: 0 };

/** Peso (0–1) de uma região fora do miolo do Jardim, com a mesma mistura da luz. */
function outerWeight(id: RegionId, x: number, z: number): number {
  const out = outsideJardimCore(x, z);
  return out === 0 ? 0 : regionWeightsInto(x, z, weights, TINT_BLEND)[id] * out;
}

/** Quanto (0–1) o ponto é Planície, para o leito e a neve; zero no miolo do Jardim. */
export const planicieWeight = (x: number, z: number): number => outerWeight('planicie', x, z);

/** Quanto (0–1) o ponto é Floresta, para a cor do leito; zero no miolo do Jardim. */
export const florestaWeight = (x: number, z: number): number => outerWeight('floresta', x, z);

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

  const w = regionWeightsInto(x, z, weights, TINT_BLEND);
  let fr = 0, fg = 0, fb = 0, sr = 0, sg = 0, sb = 0, amb = 0;
  for (let i = 0; i < MAP.regions.length; i++) {
    const id = MAP.regions[i].id;
    const t = TINTS[id];
    const wi = w[id];
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

/**
 * `planicieWeight` em GLSL, gerado a partir do mesmo mapa e das mesmas constantes, para shaders que
 * precisam do peso por ponto do mundo (a neve que cai). Define `float planicieWeight(vec2 p)`.
 */
export const PLANICIE_WEIGHT_GLSL = (() => {
  const f = (v: number) => v.toFixed(4);
  const regions = MAP.regions;
  const depth = regions
    .map((r, i) => `  float d${i} = ${f(r.radius)} - distance(p, vec2(${f(r.center[0])}, ${f(r.center[1])}));`)
    .join('\n');
  const top = regions.map((_, i) => `d${i}`).reduce((a, b) => `max(${a}, ${b})`);
  const exps = regions.map((_, i) => `  float e${i} = exp((d${i} - top) / ${f(TINT_BLEND)});`).join('\n');
  const sum = regions.map((_, i) => `e${i}`).join(' + ');
  const plain = regions.findIndex((r) => r.id === 'planicie');
  return `
float planicieWeight(vec2 p) {
  float core = smoothstep(${f(JARDIM_CORE)}, ${f(REGION_FADE_END)}, length(p));
  if (core <= 0.0) return 0.0;
${depth}
  float top = ${top};
${exps}
  return e${plain} / (${sum}) * core;
}
`;
})();
