import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import type { Vec3 } from '../services/wire';
import { nearestInto } from './creatureGlow';

/**
 * Quantas luzes pontuais de criatura existem na cena, sempre. O número nunca muda: o three.js
 * grava a contagem de luzes no shader, e cada contagem nova recompila todos os materiais
 * iluminados (centenas de ms parado no meio do voo). Elas vão para as criaturas mais próximas.
 */
export const CREATURE_LIGHT_SLOTS = 4;

/** Alcance e queda das luzes (os do brilho do Casco). */
const LIGHT_DISTANCE = 3.5;
const LIGHT_DECAY = 2;

/** Ponto à frente da câmera usado como foco (mesmo critério dos brilhos no chão). */
const FOCUS_AHEAD = 8;

interface LightRequest {
  color: THREE.Color;
  x: number;
  y: number;
  z: number;
  intensity: number;
}

/** Uma luz da reserva neste quadro; `intensity` 0 = apagada (mas presente na cena). */
export interface LightSlot {
  x: number;
  y: number;
  z: number;
  intensity: number;
  color: THREE.Color | null;
}

export interface LightPool {
  /** Chamado por cada criatura visível no seu useFrame; vale para o próximo quadro. */
  request(color: THREE.Color, x: number, y: number, z: number, intensity: number): void;
  /** Escreve em `out` os pedidos mais próximos de `target`, apaga o resto e esvazia os pedidos. */
  assign(target: Vec3, out: LightSlot[]): void;
}

export function createLightPool(): LightPool {
  // Objetos reaproveitados: as criaturas pedem todo quadro.
  const pool: LightRequest[] = [];
  let count = 0;
  // Rascunho da escolha dos mais próximos, refeito só se o tamanho de `out` mudar.
  let nearest: LightRequest[] = [];
  let nearestDist = new Float64Array(0);
  return {
    request(color, x, y, z, intensity) {
      const r = (pool[count] ??= { color, x, y, z, intensity });
      r.color = color;
      r.x = x;
      r.y = y;
      r.z = z;
      r.intensity = intensity;
      count++;
    },
    assign(target, out) {
      if (nearest.length !== out.length) {
        nearest = new Array(out.length);
        nearestDist = new Float64Array(out.length);
      }
      const found = nearestInto(pool, count, target, nearest, nearestDist);
      out.forEach((s, i) => {
        const r = nearest[i];
        if (i < found) {
          s.x = r.x;
          s.y = r.y;
          s.z = r.z;
          s.intensity = r.intensity;
          s.color = r.color;
        } else {
          s.intensity = 0;
        }
      });
      count = 0;
    },
  };
}

/** A reserva da cena; as criaturas pedem por `requestCreatureLight`. */
const scenePool = createLightPool();
export const requestCreatureLight: LightPool['request'] = (...args) => scenePool.request(...args);

const target: Vec3 = [0, 0, 0];

/** As `CREATURE_LIGHT_SLOTS` luzes de criatura: sempre montadas e visíveis, só mudam de lugar e de força. */
export function CreatureLights() {
  const camera = useThree((s) => s.camera);
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const slots = useMemo<LightSlot[]>(
    () => Array.from({ length: CREATURE_LIGHT_SLOTS }, () => ({ x: 0, y: 0, z: 0, intensity: 0, color: null })),
    [],
  );

  // Prioridade negativa: usa os pedidos do quadro anterior antes de as criaturas pedirem de novo.
  useFrame(() => {
    const e = camera.matrixWorld.elements;
    target[0] = camera.position.x - e[8] * FOCUS_AHEAD;
    target[1] = camera.position.y - e[9] * FOCUS_AHEAD;
    target[2] = camera.position.z - e[10] * FOCUS_AHEAD;
    scenePool.assign(target, slots);
    slots.forEach((s, i) => {
      const l = lights.current[i];
      if (!l) return;
      l.position.set(s.x, s.y, s.z);
      l.intensity = s.intensity;
      if (s.color) l.color.copy(s.color);
    });
  }, -1);

  return (
    <>
      {slots.map((_, i) => (
        <pointLight
          key={i}
          ref={(l) => {
            lights.current[i] = l;
          }}
          intensity={0}
          distance={LIGHT_DISTANCE}
          decay={LIGHT_DECAY}
        />
      ))}
    </>
  );
}
