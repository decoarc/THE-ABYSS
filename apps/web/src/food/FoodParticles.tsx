import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { PALETTE } from '../lib/palette';
import { requestCreatureGlow } from '../organisms/creatureGlow';
import { glowOf } from '../scene/floorGlow';
import { isCulled } from '../scene/cull';
import { foggyShader } from '../scene/glsl/material';
import { pointScale } from '../scene/glsl/points';
import { seabedHeight } from '../scene/terrain';
import { useWorld } from '../services/WorldProvider';
import type { FoodStore, Particle } from '../services/foodStore';
import type { Vec3 } from '../services/wire';
import { useSceneSettings } from '../settings';
import { hash01 } from './floraLook';

/** Teto de partículas desenhadas, igual em todos os perfis (é o teto do servidor). */
export const MAX_FOOD_PARTICLES = 400;
/** Fração das partículas em âmbar; o resto é ciano. */
const AMBER_SHARE = 0.3;
/** Tamanho no mundo: maior que a neve marinha (0,04–0,07), para a comida se destacar dela. */
const SIZE = 0.14;
/**
 * Por quadro, só as GLOW_COUNT partículas mais próximas da câmera (e até GLOW_REACH) pedem brilho no
 * leito: não inundam o pool dos brilhos de criatura.
 */
const GLOW_COUNT = 3;
const GLOW_REACH = 20;
const GLOW_RADIUS = 0.9;
const GLOW_INTENSITY = 0.3;
const CYAN_GLOW = glowOf(PALETTE.cyan, 0, 0, 0, 0).color;
const AMBER_GLOW = glowOf(PALETTE.amber, 0, 0, 0, 0).color;

const vertex = /* glsl */ `
attribute float aAlpha;
attribute float aWarm;
attribute float aSeed;
uniform float uTime;
uniform float uPointScale;
uniform vec3 uCyan;
uniform vec3 uAmber;
varying float vAlpha;
varying vec3 vColor;
#include <fog_pars_vertex>
void main() {
  vColor = mix(uCyan, uAmber, aWarm);
  vAlpha = aAlpha * (0.8 + 0.2 * sin(uTime * 0.9 + aSeed * 50.0));
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float depth = -mvPosition.z;
  // Partícula apagada não ocupa pixel; perto da câmera o tamanho para de crescer.
  gl_PointSize = aAlpha > 0.0 ? max(1.5, ${SIZE.toFixed(2)} * uPointScale / max(depth, 2.0)) : 0.0;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
#include <fog_pars_fragment>
void main() {
  float d = length(gl_PointCoord - 0.5);
  // Núcleo firme e halo curto: um grão aceso, não um floco difuso como a neve.
  float core = smoothstep(0.22, 0.05, d);
  float halo = smoothstep(0.5, 0.15, d) * 0.35;
  gl_FragColor = vec4(vColor * (core * 1.4 + halo) * vAlpha, 1.0);
  #include <fog_fragment>
}
`;

/**
 * Partículas canônicas num único Points, sempre montado e sempre com MAX_FOOD_PARTICLES vértices:
 * as que estão até CULL_DISTANCE ocupam os primeiros slots, o resto fica apagado (alpha 0).
 */
export function FoodParticles() {
  const { store } = useWorld();
  const { motion } = useSceneSettings();

  const { geometry, material, attrs } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(MAX_FOOD_PARTICLES * 3), 3);
    const alpha = new THREE.BufferAttribute(new Float32Array(MAX_FOOD_PARTICLES), 1);
    const warm = new THREE.BufferAttribute(new Float32Array(MAX_FOOD_PARTICLES), 1);
    const seed = new THREE.BufferAttribute(new Float32Array(MAX_FOOD_PARTICLES), 1);
    for (const a of [position, alpha, warm, seed]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', position);
    g.setAttribute('aAlpha', alpha);
    g.setAttribute('aWarm', warm);
    g.setAttribute('aSeed', seed);
    const m = foggyShader({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPointScale: { value: 1 },
        uCyan: { value: new THREE.Color(PALETTE.cyan) },
        uAmber: { value: new THREE.Color(PALETTE.amber) },
      },
    });
    return { geometry: g, material: m, attrs: { position, alpha, warm, seed } };
  }, []);

  // Um passe por quadro sobre as partículas, com callback estável: nada é alocado no quadro.
  const pass = useMemo(() => {
    const st = {
      food: null as FoodStore | null,
      now: 0,
      cam: new THREE.Vector3(),
      n: 0,
      lastN: 0,
      out: [0, 0, 0] as Vec3,
      point: { x: 0, y: 0, z: 0 },
      /** As mais próximas da câmera neste quadro: distância² e slot, em ordem; `glowN` preenchidas. */
      glowDist: new Float64Array(GLOW_COUNT),
      glowSlot: new Int32Array(GLOW_COUNT),
      glowN: 0,
    };
    const pos = attrs.position.array as Float32Array;
    const alpha = attrs.alpha.array as Float32Array;
    const warm = attrs.warm.array as Float32Array;
    const seed = attrs.seed.array as Float32Array;
    const visit = (p: Particle) => {
      const food = st.food;
      if (!food || st.n >= MAX_FOOD_PARTICLES) return;
      const a = food.particleAlpha(p, st.now);
      if (a <= 0) return;
      const { out, point, cam } = st;
      food.particlePosition(p, st.now, out);
      point.x = out[0];
      point.y = Math.max(out[1], seabedHeight(out[0], out[2]) + 0.05);
      point.z = out[2];
      if (isCulled(cam, point)) return;
      const n = st.n++;
      pos[n * 3] = point.x;
      pos[n * 3 + 1] = point.y;
      pos[n * 3 + 2] = point.z;
      alpha[n] = a;
      const w = hash01(p.id, 1) < AMBER_SHARE ? 1 : 0;
      warm[n] = w;
      seed[n] = hash01(p.id, 2);
      const dx = point.x - cam.x, dy = point.y - cam.y, dz = point.z - cam.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d >= GLOW_REACH * GLOW_REACH) return;
      // Inserção no vetor fixo das mais próximas.
      const { glowDist, glowSlot } = st;
      if (st.glowN === GLOW_COUNT && d >= glowDist[GLOW_COUNT - 1]) return;
      let i = st.glowN < GLOW_COUNT ? st.glowN++ : GLOW_COUNT - 1;
      while (i > 0 && glowDist[i - 1] > d) {
        glowDist[i] = glowDist[i - 1];
        glowSlot[i] = glowSlot[i - 1];
        i--;
      }
      glowDist[i] = d;
      glowSlot[i] = n;
    };
    return { st, pos, alpha, warm, visit };
  }, [attrs]);

  useFrame((state, dt) => {
    material.uniforms.uTime.value += clampDelta(dt) * motion;
    material.uniforms.uPointScale.value = pointScale(state);
    const { st, pos, alpha, warm, visit } = pass;
    st.food = store.food();
    st.now = store.serverNow(performance.now());
    st.cam.copy(state.camera.position);
    st.n = 0;
    st.glowN = 0;
    st.food.particles().forEach(visit);
    for (let i = 0; i < st.glowN; i++) {
      const k = st.glowSlot[i];
      const color = warm[k] ? AMBER_GLOW : CYAN_GLOW;
      requestCreatureGlow('food', color, pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2], GLOW_RADIUS, GLOW_INTENSITY * alpha[k]);
    }
    // Slots que ficaram vagos neste quadro se apagam.
    for (let i = st.n; i < st.lastN; i++) alpha[i] = 0;
    if (st.n > 0 || st.lastN > 0) {
      attrs.position.needsUpdate = true;
      attrs.alpha.needsUpdate = true;
      attrs.warm.needsUpdate = true;
      attrs.seed.needsUpdate = true;
    }
    st.lastN = st.n;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
