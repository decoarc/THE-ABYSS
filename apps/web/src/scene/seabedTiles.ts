import { MAP } from '../world/map';

/** Lado de cada bloco do leito. */
export const TILE_SIZE = 30;
/** Chão além da borda das regiões, para a névoa engolir antes do fim do leito. */
export const TILE_MARGIN = 30;

export interface SeabedTile {
  cx: number;
  cz: number;
  size: number;
}

/** Blocos de 30 × 30, numa grade alinhada a múltiplos de 30, cobrindo o retângulo das regiões mais a margem. */
export function seabedTiles(): SeabedTile[] {
  const xs = MAP.regions.flatMap((r) => [r.center[0] - r.radius, r.center[0] + r.radius]);
  const zs = MAP.regions.flatMap((r) => [r.center[1] - r.radius, r.center[1] + r.radius]);
  const i0 = Math.floor((Math.min(...xs) - TILE_MARGIN) / TILE_SIZE);
  const i1 = Math.ceil((Math.max(...xs) + TILE_MARGIN) / TILE_SIZE);
  const k0 = Math.floor((Math.min(...zs) - TILE_MARGIN) / TILE_SIZE);
  const k1 = Math.ceil((Math.max(...zs) + TILE_MARGIN) / TILE_SIZE);
  const tiles: SeabedTile[] = [];
  for (let k = k0; k < k1; k++)
    for (let i = i0; i < i1; i++) tiles.push({ cx: (i + 0.5) * TILE_SIZE, cz: (k + 0.5) * TILE_SIZE, size: TILE_SIZE });
  return tiles;
}
