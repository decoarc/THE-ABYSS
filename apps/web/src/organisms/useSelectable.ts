import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useWorld } from '../services/WorldProvider';

/** Handlers do grupo raiz de uma criatura: clique seleciona, o cursor vira mão ao passar. */
export function useSelectable(id: string) {
  const { selection } = useWorld();
  return useMemo(
    () => ({
      onClick: (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        // Arrasto da câmera que termina sobre a criatura não seleciona.
        if (e.delta <= 4) selection.select(id);
      },
      onPointerOver: () => {
        document.body.style.cursor = 'pointer';
      },
      onPointerOut: () => {
        document.body.style.cursor = '';
      },
    }),
    [id, selection],
  );
}
