import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld } from '../services/WorldProvider';
import type { Vec3 } from '../services/wire';

export interface OrganismPose {
  /** Posição canônica interpolada, atualizada a cada quadro. */
  pos: THREE.Vector3;
  /** Velocidade canônica interpolada, em unidades/s. */
  vel: THREE.Vector3;
  /** Falso enquanto o store não tem amostra para o id: o componente esconde o grupo. */
  has: { current: boolean };
}

/**
 * Pose de um organismo vinda do servidor, amostrada do store a cada quadro.
 * Chame antes do `useFrame` do componente: callbacks de mesma prioridade rodam
 * na ordem de registro, então o componente sempre lê a pose do quadro atual.
 */
export function useOrganismPose(id: string): OrganismPose {
  const { store } = useWorld();
  const has = useRef(false);
  const pose = useMemo(
    () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), p: [0, 0, 0] as Vec3, v: [0, 0, 0] as Vec3 }),
    [],
  );

  useFrame(() => {
    // Nunca guardar referências internas do store: os buffers são trocados a cada snapshot.
    has.current = store.sample(id, performance.now(), pose.p, pose.v);
    if (!has.current) return;
    pose.pos.set(pose.p[0], pose.p[1], pose.p[2]);
    pose.vel.set(pose.v[0], pose.v[1], pose.v[2]);
  });

  return useMemo(() => ({ pos: pose.pos, vel: pose.vel, has }), [pose]);
}
