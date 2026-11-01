import { CAMERA, fovForAspect } from './cameraConfig';
import { TILE_MARGIN, seabedTiles } from './seabedTiles';

it('zoom máximo + alvo extremo ainda tem a margem inteira de leito em volta', () => {
  const farX = Math.max(...CAMERA.targetBounds.x.map(Math.abs));
  const farZ = Math.max(...CAMERA.targetBounds.z.map(Math.abs));
  const reach = Math.hypot(farX, farZ) + CAMERA.maxDistance + TILE_MARGIN;
  const tiles = seabedTiles();
  const covered = (x: number, z: number) =>
    tiles.some((t) => Math.abs(x - t.cx) <= t.size / 2 && Math.abs(z - t.cz) <= t.size / 2);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 32) expect(covered(Math.cos(a) * reach, Math.sin(a) * reach)).toBe(true);
});
it('não deixa olhar por baixo do leito', () => expect(CAMERA.maxPolarAngle).toBeLessThan(Math.PI / 2));
it('tela retrato aumenta o FOV', () => expect(fovForAspect(390 / 844)).toBeGreaterThan(fovForAspect(16 / 9)));
it('FOV limitado', () => {
  expect(fovForAspect(0.2)).toBeLessThanOrEqual(75);
  expect(fovForAspect(3)).toBeGreaterThanOrEqual(CAMERA.fov);
});
