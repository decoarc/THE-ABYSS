type Vec3 = [number, number, number];

/**
 * Quadro herói do Jardim: pose da câmera antes do primeiro snapshot e ponto de partida quando
 * não há nada à vista. Na tela de toque, a órbita usa os limites de distância e de ângulo polar.
 */
export const CAMERA: {
  position: Vec3;
  target: Vec3;
  fov: number;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
} = {
  position: [0, 8.2, 17.5],
  target: [0, 3.1, 0],
  fov: 42,
  minDistance: 3,
  maxDistance: 15,
  minPolarAngle: 0.95,
  maxPolarAngle: 1.47,
};

/** Proporção do enquadramento herói (a mesma da referência, 16:10). */
const HERO_ASPECT = 16 / 10;
const MAX_FOV = 75;
const deg = Math.PI / 180;

/**
 * FOV vertical que preserva a largura do enquadramento herói em telas mais
 * estreitas que 16:10; telas mais largas mantêm o FOV base.
 */
export function fovForAspect(aspect: number): number {
  const halfH = Math.tan((CAMERA.fov * deg) / 2) * HERO_ASPECT;
  const fov = (2 * Math.atan(halfH / aspect)) / deg;
  return Math.min(MAX_FOV, Math.max(CAMERA.fov, fov));
}
