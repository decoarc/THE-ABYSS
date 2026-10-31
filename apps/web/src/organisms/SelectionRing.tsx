import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../lib/palette';
import { useSelection, useWorld } from '../services/WorldProvider';
import { useOrganismPose } from './useOrganismPose';

/** Raio do anel em relação ao corpo: um pouco maior que a criatura. */
const RING_SCALE = 1.4;

/** Anel fino e aditivo sobre o organismo selecionado; não aparece sem seleção. */
export function SelectionRing() {
  const { id } = useSelection();
  if (id === null) return null;
  return <Ring key={id} id={id} />;
}

function Ring({ id }: { id: string }) {
  const { store } = useWorld();
  const pose = useOrganismPose(id);
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const bodyRadius = useMemo(() => {
    const species = store.roster().find((o) => o.id === id)?.species;
    return store.species().find((s) => s.id === species)?.body_radius ?? 1;
  }, [id, store]);

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: PALETTE.cyan,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const geometry = useMemo(() => new THREE.RingGeometry(0.97, 1, 96), []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.visible = pose.has.current;
    if (!g.visible) return;
    g.position.copy(pose.pos);
    g.quaternion.copy(camera.quaternion);
    g.scale.setScalar(bodyRadius * RING_SCALE);
  });

  return (
    <group ref={group} visible={false}>
      <mesh geometry={geometry} material={material} />
    </group>
  );
}
