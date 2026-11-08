import { useCallback, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld } from '../services/WorldProvider';
import type { Vitals } from '../services/worldStore';
import { dissolve, energyGlow, lifeScale, stretch } from './vitals';

export interface VitalsRefs {
  /** Brilho do núcleo, 0..1 (1 = energia cheia). */
  glow: { current: number };
  /** Escala de vida: jovem < 1, crescendo até 1. */
  scale: { current: number };
  /** Alongamento de divisão, 1..1.8. */
  stretch: { current: number };
  /** Opacidade/brilho do corpo, 1 vivo -> 0 desfeito. */
  fade: { current: number };
}

/**
 * Estado vital do organismo, atualizado a cada quadro em refs. Chame antes do
 * `useFrame` do componente (mesma regra do `useOrganismPose`). Sem registro no
 * store, mantém o último valor (os valores iniciais são "adulto, cheio, vivo").
 */
export function useVitals(id: string): VitalsRefs {
  const { store } = useWorld();
  const refs = useMemo(
    () => ({ glow: { current: 1 }, scale: { current: 1 }, stretch: { current: 1 }, fade: { current: 1 } }),
    [],
  );
  const v = useMemo<Vitals>(
    () => ({ energy: 1, juvenile: false, dividing: false, maturedAtMs: null, dividingSinceMs: null, dyingSinceMs: null }),
    [],
  );
  useFrame(() => {
    if (!store.vitals(id, v)) return;
    const now = performance.now();
    refs.glow.current = energyGlow(v.energy, now / 1000);
    refs.scale.current = lifeScale(v, now, store.juvenileScale());
    refs.stretch.current = stretch(v, now, store.divideS());
    refs.fade.current = dissolve(v, now);
  });
  return refs;
}

const UP = new THREE.Vector3(0, 1, 0);
/** Abaixo desta velocidade (unidades/s) a direção é ruído: o alongamento mantém o último eixo. */
const MIN_AXIS_SPEED = 0.02;

/**
 * Alonga o corpo no eixo da velocidade em espaço de mundo, sem mexer na rotação do corpo:
 * `frame` (gira para o eixo e estica) contém `counter` (desfaz a rotação), que contém o corpo.
 * Com alongamento 1 ambos ficam em identidade: nada muda em relação a hoje.
 */
export function useStretchFrame() {
  const frame = useRef<THREE.Group>(null);
  const counter = useRef<THREE.Group>(null);
  const st = useMemo(() => ({ axis: new THREE.Vector3(0, 1, 0), q: new THREE.Quaternion() }), []);
  const apply = useCallback(
    (vel: THREE.Vector3, s: number) => {
      const f = frame.current;
      const c = counter.current;
      if (!f || !c) return;
      if (s <= 1.0001) {
        f.quaternion.identity();
        f.scale.set(1, 1, 1);
        c.quaternion.identity();
        return;
      }
      const speed = vel.length();
      if (speed > MIN_AXIS_SPEED) st.axis.copy(vel).divideScalar(speed);
      st.q.setFromUnitVectors(UP, st.axis);
      const k = 1 / Math.sqrt(s);
      f.quaternion.copy(st.q);
      f.scale.set(k, s, k);
      c.quaternion.copy(st.q).invert();
    },
    [st],
  );
  return { frame, counter, apply };
}
