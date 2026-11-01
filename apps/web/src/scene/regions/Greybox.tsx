import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../../lib/palette';
import { MAP } from '../../world/map';
import { seabedHeight } from '../terrain';

/** Esponjas da Floresta em rascunho: cilindros translúcidos no lugar e no tamanho do mapa, até a arte da Task 11. */
export function Greybox() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), []);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.violet,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    MAP.sponges.forEach((sp, i) => {
      p.set(sp.x, seabedHeight(sp.x, sp.z) + sp.h / 2, sp.z);
      s.set(sp.r, sp.h, sp.r);
      m.setMatrixAt(i, matrix.compose(p, q, s));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, []);

  return <instancedMesh ref={mesh} args={[geometry, material, MAP.sponges.length]} />;
}
