import { createNoise2D, fbm2D } from '../lib/noise';
import { MAP, type Region, type RegionId } from '../world/map';

export const terrainNoise = createNoise2D(11);

/** Raio do miolo aprovado do Jardim: dentro dele o leito é exatamente o do gate I. */
const JARDIM_CORE = 26;
/** Largura da passagem do leito do Jardim para o perfil das regiões, a partir do miolo. */
const JARDIM_FADE = 10;
/** Largura (unidades de profundidade de borda) da mistura entre perfis; mais larga que a de `map.ts` para o chão não dar degrau. */
const TERRAIN_BLEND = 5;
/** Altura média do chão fora do miolo (a borda da bacia do Jardim). */
const BASE = 1.2;
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

/** Floresta: relevo rochoso médio, cristas suaves sobre ondulação larga. */
function florestaHeight(x: number, z: number): number {
  const broad = fbm2D(terrainNoise, x * 0.05 - 31, z * 0.05 + 57, 3) * 1.0;
  const ridge = (1 - Math.abs(fbm2D(terrainNoise, x * 0.09 + 13, z * 0.09 - 71, 2))) ** 2 * 0.6;
  const grit = fbm2D(terrainNoise, x * 0.4 - 5, z * 0.4 + 22, 2) * 0.1;
  return BASE + broad + ridge - 0.35 + grit;
}

/** Planície: dunas baixas e largas, com a crista levemente torta. */
function planicieHeight(x: number, z: number): number {
  const warp = fbm2D(terrainNoise, x * 0.03 + 91, z * 0.03 - 44, 2) * 6;
  const dunes = Math.sin((x * 0.8 + z * 0.6) * 0.32 + warp) * 0.22;
  const swell = fbm2D(terrainNoise, x * 0.025 - 120, z * 0.025 + 80, 2) * 0.35;
  return BASE - 0.1 + dunes + swell;
}

const PROFILES: Record<RegionId, (x: number, z: number) => number> = {
  jardim: legacyJardimHeight,
  floresta: florestaHeight,
  planicie: planicieHeight,
};

const depthIn = (r: Region, x: number, z: number) => r.radius - Math.hypot(x - r.center[0], z - r.center[1]);

/** Altura do leito em (x, z), no mapa inteiro; usada pelo leito e para assentar tudo que fica no chão. */
export function seabedHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r <= JARDIM_CORE) return legacyJardimHeight(x, z);

  // Pesos suaves por região (softmax da profundidade de borda, mais largo que regionWeights).
  let top = -Infinity;
  for (const reg of MAP.regions) top = Math.max(top, depthIn(reg, x, z));
  let sum = 0;
  let blended = 0;
  for (const reg of MAP.regions) {
    const w = Math.exp((depthIn(reg, x, z) - top) / TERRAIN_BLEND);
    sum += w;
    blended += w * PROFILES[reg.id](x, z);
  }
  blended /= sum;

  // A partir do miolo, o leito aprovado cede ao perfil misturado; fora do mapa, o chão sobe.
  const keep = 1 - smoothstep(JARDIM_CORE, JARDIM_CORE + JARDIM_FADE, r);
  const rim = smoothstep(0, RIM_WIDTH, -top) * RIM_HEIGHT;
  return keep * legacyJardimHeight(x, z) + (1 - keep) * blended + rim;
}
