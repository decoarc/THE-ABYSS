import { CAMERA, fovForAspect } from './cameraConfig';
import { FLY } from './freeFly';
import { TILE_MARGIN, seabedTiles } from './seabedTiles';
import { MAP, edgeDepth } from '../world/map';

it('na borda dura da câmera ainda há leito em volta', () => {
  // A câmera vai até edge_depth = edgeHard; o leito precisa seguir além disso o bastante para a névoa engolir o fim.
  const reach = TILE_MARGIN + FLY.edgeHard; // margem que sobra além da borda dura
  const tiles = seabedTiles();
  const covered = (x: number, z: number) =>
    tiles.some((t) => Math.abs(x - t.cx) <= t.size / 2 && Math.abs(z - t.cz) <= t.size / 2);
  for (const r of MAP.regions) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 32) {
      const [dx, dz] = [Math.cos(a), Math.sin(a)];
      // Caminha para fora do centro até a borda dura (passando por regiões vizinhas, se houver).
      let d = 0; // último ponto ainda dentro da borda dura
      while (edgeDepth(r.center[0] + dx * (d + 0.25), r.center[1] + dz * (d + 0.25)) >= FLY.edgeHard) d += 0.25;
      expect(covered(r.center[0] + dx * (d + reach), r.center[1] + dz * (d + reach))).toBe(true);
    }
  }
});
it('não deixa olhar por baixo do leito', () => expect(CAMERA.maxPolarAngle).toBeLessThan(Math.PI / 2));
it('tela retrato aumenta o FOV', () => expect(fovForAspect(390 / 844)).toBeGreaterThan(fovForAspect(16 / 9)));
it('FOV limitado', () => {
  expect(fovForAspect(0.2)).toBeLessThanOrEqual(75);
  expect(fovForAspect(3)).toBeGreaterThanOrEqual(CAMERA.fov);
});
