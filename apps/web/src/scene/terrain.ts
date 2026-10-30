import { createNoise2D, fbm2D } from '../lib/noise';

export const terrainNoise = createNoise2D(11);

/** Altura do leito em (x, z); usada pelo leito e para assentar tudo que fica no chão. */
export function seabedHeight(x: number, z: number): number {
  const broad = fbm2D(terrainNoise, x * 0.045, z * 0.045, 4) * 1.1;
  const fine = fbm2D(terrainNoise, x * 0.35 + 40, z * 0.35 - 17, 2) * 0.12;
  // Bacia rasa ao redor da chaminé herói, borda subindo de leve para fechar o fundo.
  const r = Math.hypot(x, z);
  const bowl = Math.min(1, r / 30) ** 2 * 1.4;
  return broad + fine + bowl - 0.2;
}
