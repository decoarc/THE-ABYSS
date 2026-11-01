import { createNoise2D, fbm2D } from '../lib/noise';
import { MAP, edgeDepth, regionWeights, type RegionId } from '../world/map';

export const terrainNoise = createNoise2D(11);

/** Raio do miolo aprovado do Jardim: dentro dele o leito é exatamente o do gate I. */
export const JARDIM_CORE = 26;
/** Largura da passagem do leito do Jardim para o perfil das regiões, a partir do miolo. */
export const JARDIM_FADE = 6;
/** Largura (unidades de profundidade de borda) da mistura entre perfis; mais larga que a de `map.ts` para o chão não dar degrau. */
const TERRAIN_BLEND = 5;
/** Fora do mapa o chão sobe devagar até esta altura, `RIM_WIDTH` unidades depois da borda. */
const RIM_HEIGHT = 3;
const RIM_WIDTH = 30;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Leito do Jardim aprovado no gate I (bacia rasa ao redor da chaminé herói). */
export function legacyJardimHeight(x: number, z: number): number {
  const broad = fbm2D(terrainNoise, x * 0.045, z * 0.045, 4) * 1.1;
  const fine = fbm2D(terrainNoise, x * 0.35 + 40, z * 0.35 - 17, 2) * 0.12;
  // Bacia rasa ao redor da chaminé herói, borda subindo de leve para fechar o fundo.
  const r = Math.hypot(x, z);
  const bowl = Math.min(1, r / 30) ** 2 * 1.4;
  return broad + fine + bowl - 0.2;
}

/**
 * Jardim fora do miolo: o mesmo relevo do leito aprovado, sem a borda da bacia subindo,
 * para o chão ficar abaixo da faixa onde as criaturas nadam.
 */
function jardimOuterHeight(x: number, z: number): number {
  const broad = fbm2D(terrainNoise, x * 0.045, z * 0.045, 4) * 0.7;
  const fine = fbm2D(terrainNoise, x * 0.35 + 40, z * 0.35 - 17, 2) * 0.12;
  return broad + fine + 0.1;
}

/** Floresta: relevo rochoso médio, cristas suaves sobre ondulação larga. */
function florestaHeight(x: number, z: number): number {
  const broad = fbm2D(terrainNoise, x * 0.05 - 31, z * 0.05 + 57, 3) * 0.8;
  const ridge = (1 - Math.abs(fbm2D(terrainNoise, x * 0.09 + 13, z * 0.09 - 71, 2))) ** 2 * 0.5;
  const grit = fbm2D(terrainNoise, x * 0.4 - 5, z * 0.4 + 22, 2) * 0.1;
  return broad + ridge + grit - 0.25;
}

/** Planície: dunas baixas e largas, com a crista levemente torta. */
function planicieHeight(x: number, z: number): number {
  const warp = fbm2D(terrainNoise, x * 0.03 + 91, z * 0.03 - 44, 2) * 6;
  const dunes = Math.sin((x * 0.8 + z * 0.6) * 0.32 + warp) * 0.2;
  const swell = fbm2D(terrainNoise, x * 0.025 - 120, z * 0.025 + 80, 2) * 0.3;
  return dunes + swell + 0.2;
}

const PROFILES: Record<RegionId, (x: number, z: number) => number> = {
  jardim: jardimOuterHeight,
  floresta: florestaHeight,
  planicie: planicieHeight,
};

/** Altura do leito em (x, z), no mapa inteiro; usada pelo leito e para assentar tudo que fica no chão. */
export function seabedHeight(x: number, z: number): number {
  const legacy = legacyJardimHeight(x, z);
  const r = Math.hypot(x, z);
  if (r <= JARDIM_CORE) return legacy;

  const w = regionWeights(x, z, TERRAIN_BLEND);
  let blended = 0;
  for (const reg of MAP.regions) blended += w[reg.id] * PROFILES[reg.id](x, z);

  // A partir do miolo, o leito aprovado cede ao perfil misturado; fora do mapa, o chão sobe.
  const keep = 1 - smoothstep(JARDIM_CORE, JARDIM_CORE + JARDIM_FADE, r);
  const rim = smoothstep(0, RIM_WIDTH, -edgeDepth(x, z)) * RIM_HEIGHT;
  return keep * legacy + (1 - keep) * blended + rim;
}
