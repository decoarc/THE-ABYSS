import { useMemo } from 'react';
import * as THREE from 'three';
import { fbm2D } from '../lib/noise';
import { PALETTE } from '../lib/palette';
import { SEABED_RADIUS } from './cameraConfig';
import { seabedHeight, terrainNoise as noise } from './terrain';

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
