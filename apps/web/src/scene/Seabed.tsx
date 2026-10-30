import { useMemo } from 'react';
import * as THREE from 'three';
import { createNoise2D, fbm2D } from '../lib/noise';
import { PALETTE } from '../lib/palette';
import { SEABED_RADIUS } from './cameraConfig';

const noise = createNoise2D(11);

/** Altura do leito em (x, z); exportada para assentar rochas, flora e chaminés. */
export function seabedHeight(x: number, z: number): number {
  const broad = fbm2D(noise, x * 0.045, z * 0.045, 4) * 1.1;
  const fine = fbm2D(noise, x * 0.35 + 40, z * 0.35 - 17, 2) * 0.12;
  // Bacia rasa ao redor da chaminé herói, borda subindo de leve para fechar o fundo.
  const r = Math.hypot(x, z);
  const bowl = Math.min(1, r / 30) ** 2 * 1.4;
  return broad + fine + bowl - 0.2;
}

export function Seabed() {
  const geometry = useMemo(() => {
    const g = new THREE.RingGeometry(0.001, SEABED_RADIUS, 160, 90);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const dark = new THREE.Color(PALETTE.bg);
    const mid = new THREE.Color(PALETTE.navy).lerp(new THREE.Color(PALETTE.teal), 0.25);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, seabedHeight(x, z));
      const t = THREE.MathUtils.clamp(0.5 + fbm2D(noise, x * 0.12 + 9, z * 0.12, 3) * 0.9, 0, 1);
      tmp.copy(dark).lerp(mid, t);
      tmp.toArray(colors, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow={false}>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  );
}
