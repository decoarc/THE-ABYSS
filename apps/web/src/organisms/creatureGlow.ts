import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { CREATURE_GLOW_SLOTS, FLOOR_SLOTS, floorGlows, setCreatureGlow } from '../scene/floorGlow';
import type { Vec3 } from '../services/wire';

/** Pedido de uma criatura para tingir o leito abaixo dela. `color` em RGB linear. */
export interface GlowRequest {
  id: string;
  color: [number, number, number];
  x: number;
  y: number;
  z: number;
  radius: number;
  intensity: number;
}

type Placed = { x: number; y: number; z: number };

const dist2 = (r: Placed, t: Vec3) => (r.x - t[0]) ** 2 + (r.y - t[1]) ** 2 + (r.z - t[2]) ** 2;

/** Os `n` pedidos mais próximos de `target`, do mais perto ao mais longe. Não altera `reqs`. */
export function pickNearest<T extends Placed>(reqs: readonly T[], target: Vec3, n: number): T[] {
  return reqs
    .map((r) => ({ r, d: dist2(r, target) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, Math.max(0, n))
    .map((e) => e.r);
}

// Pedidos acumulados desde o último início de quadro. Objetos reaproveitados: criaturas pedem todo quadro.
const pool: GlowRequest[] = [];
let count = 0;

/** Chamado por cada criatura no seu useFrame; vale para o próximo quadro. */
export function requestCreatureGlow(
  id: string,
  color: [number, number, number],
  x: number,
  y: number,
  z: number,
  radius: number,
  intensity: number,
): void {
  let r = pool[count];
  if (!r) {
    r = { id, color, x, y, z, radius, intensity };
    pool[count] = r;
  } else {
    r.id = id;
    r.color = color;
    r.x = x;
    r.y = y;
    r.z = z;
    r.radius = radius;
    r.intensity = intensity;
  }
  count++;
}

function clearCreatureSlots(from: number) {
  for (let i = from; i < CREATURE_GLOW_SLOTS; i++) floorGlows.clear(FLOOR_SLOTS.creatures + i);
}

/** Sem controle de órbita (câmera livre), o foco dos brilhos é este ponto à frente da câmera. */
const FOCUS_AHEAD = 8;
const target: Vec3 = [0, 0, 0];

/**
 * No início de cada quadro (antes do leito empacotar os brilhos), escreve nos slots
 * de criatura os pedidos do quadro anterior mais próximos do alvo da câmera (ou do ponto à frente dela).
 */
export function CreatureGlows() {
  const controls = useThree((s) => s.controls) as unknown as { target?: THREE.Vector3 } | null;
  const camera = useThree((s) => s.camera);

  useEffect(
    () => () => {
      count = 0;
      clearCreatureSlots(0);
    },
    [],
  );

  // Prioridade negativa: roda antes dos useFrame de prioridade 0 (o leito e as criaturas).
  useFrame(() => {
    const t = controls?.target;
    if (t) {
      target[0] = t.x;
      target[1] = t.y;
      target[2] = t.z;
    } else {
      // A câmera olha para −z local: a terceira coluna da matriz de mundo, com o sinal trocado.
      const e = camera.matrixWorld.elements;
      target[0] = camera.position.x - e[8] * FOCUS_AHEAD;
      target[1] = camera.position.y - e[9] * FOCUS_AHEAD;
      target[2] = camera.position.z - e[10] * FOCUS_AHEAD;
    }
    const nearest = pickNearest(pool.slice(0, count), target, CREATURE_GLOW_SLOTS);
    nearest.forEach((r, i) =>
      setCreatureGlow(FLOOR_SLOTS.creatures + i, r.color, r.x, r.y, r.z, r.intensity, floorGlows, r.radius),
    );
    clearCreatureSlots(nearest.length);
    count = 0;
  }, -1);

  return null;
}
