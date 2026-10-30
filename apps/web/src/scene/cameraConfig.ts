type Vec3 = [number, number, number];

/** Raio do leito; a névoa precisa engolir tudo a partir de ~0.8 × este raio. */
export const SEABED_RADIUS = 60;

export const CAMERA: {
  position: Vec3;
  target: Vec3;
  fov: number;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
  targetBounds: { x: [number, number]; y: [number, number]; z: [number, number] };
} = {
  position: [0, 3.4, 14],
  target: [0, 2.4, 0],
  fov: 42,
  minDistance: 5,
  maxDistance: 20,
  minPolarAngle: 0.95,
  maxPolarAngle: 1.47,
  minAzimuthAngle: -0.95,
  maxAzimuthAngle: 0.95,
  targetBounds: { x: [-5, 5], y: [0.8, 4.5], z: [-5, 5] },
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
