import { useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import type { OrganismPose } from '../organisms/useOrganismPose';

/** Além desta distância da câmera nada é desenhado: a névoa já engoliu tudo. */
export const CULL_DISTANCE = 55;

type Point = { x: number; y: number; z: number };

export function isCulled(camPos: Point, pos: Point): boolean {
  const dx = pos.x - camPos.x, dy = pos.y - camPos.y, dz = pos.z - camPos.z;
  return dx * dx + dy * dy + dz * dz > CULL_DISTANCE * CULL_DISTANCE;
}

/**
 * Esconde o grupo de uma criatura sem amostra ou além de `CULL_DISTANCE`. Devolve
 * `shown`: o `useFrame` do componente sai cedo quando `shown.current` é falso.
 * Chame depois de `useOrganismPose` e antes do `useFrame` do componente (mesma prioridade, ordem de registro).
 */
export function useCreatureCull(group: RefObject<THREE.Object3D | null>, pose: OrganismPose): { current: boolean } {
  const camera = useThree((s) => s.camera);
  const shown = useRef(false);
  useFrame(() => {
    shown.current = pose.has.current && !isCulled(camera.position, pose.pos);
    if (group.current) group.current.visible = shown.current;
  });
  return shown;
}
