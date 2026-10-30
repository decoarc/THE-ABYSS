import type { RootState } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Fator que converte tamanho em unidades do mundo para pixels de `gl_PointSize`
 * (dividido pela profundidade no shader): `size * uPointScale / -mvPosition.z`.
 */
export function pointScale(state: RootState): number {
  const camera = state.camera as THREE.PerspectiveCamera;
  const halfFov = THREE.MathUtils.degToRad(camera.fov ?? 45) / 2;
  return (state.gl.getPixelRatio() * state.size.height * 0.5) / Math.tan(halfFov);
}
