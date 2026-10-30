import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createNoise2D } from '../../lib/noise';
import { PALETTE } from '../../lib/palette';
import { createRng } from '../../lib/random';
import { useSceneSettings } from '../../settings';
import { seabedHeight } from '../terrain';
import { VENTS, scatter } from './layout';

/** Icosaedro com vértices empurrados por ruído: uma pedra genérica, variada por escala e rotação. */
function rockGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const noise = createNoise2D(5);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + 0.35 * noise(v.x * 1.7 + v.z, v.y * 1.7);
    v.multiplyScalar(k);
    v.y *= 0.62;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function Rocks() {
  const { q } = useSceneSettings();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(rockGeometry, []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const rng = createRng(77);
    const avoid = VENTS.map((v) => ({ center: [v.position[0], v.position[2]] as [number, number], radius: v.radius * 1.8 }));
    const points = scatter(rng, q.rockCount, { minR: 1.8, maxR: 40, avoid });
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const color = new THREE.Color();
    const dark = new THREE.Color(PALETTE.bg);
    const navy = new THREE.Color(PALETTE.navy);
    points.forEach(([x, z], i) => {
      const r = Math.hypot(x, z);
      // Pedras maiores perto das chaminés; cascalho no resto.
      const near = Math.max(0, 1 - r / 12);
      const size = 0.12 + rng() ** 3 * 0.9 + near * rng() * 0.9;
      scale.set(size * (0.8 + rng() * 0.6), size * (0.6 + rng() * 0.6), size * (0.8 + rng() * 0.6));
      euler.set(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6);
      quat.setFromEuler(euler);
      position.set(x, seabedHeight(x, z) + scale.y * 0.15, z);
      matrix.compose(position, quat, scale);
      m.setMatrixAt(i, matrix);
      m.setColorAt(i, color.copy(dark).lerp(navy, 0.4 + rng() * 0.6));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [q.rockCount]);

  return (
    <instancedMesh key={q.rockCount} ref={mesh} args={[geometry, undefined, q.rockCount]}>
      <meshStandardMaterial roughness={1} metalness={0} flatShading />
    </instancedMesh>
  );
}
