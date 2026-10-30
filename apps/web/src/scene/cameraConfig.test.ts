import { CAMERA, SEABED_RADIUS, fovForAspect } from './cameraConfig';

it('zoom máximo + alvo extremo não ultrapassa a borda escondida pela névoa', () => {
  const farX = Math.max(...CAMERA.targetBounds.x.map(Math.abs));
  const farZ = Math.max(...CAMERA.targetBounds.z.map(Math.abs));
  expect(Math.hypot(farX, farZ) + CAMERA.maxDistance).toBeLessThan(SEABED_RADIUS * 0.8);
});
it('não deixa olhar por baixo do leito', () => expect(CAMERA.maxPolarAngle).toBeLessThan(Math.PI / 2));
it('tela retrato aumenta o FOV', () => expect(fovForAspect(390 / 844)).toBeGreaterThan(fovForAspect(16 / 9)));
it('FOV limitado', () => {
  expect(fovForAspect(0.2)).toBeLessThanOrEqual(75);
  expect(fovForAspect(3)).toBeGreaterThanOrEqual(CAMERA.fov);
});
