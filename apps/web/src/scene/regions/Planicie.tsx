import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../../lib/motion';
import { PALETTE } from '../../lib/palette';
import { createRng } from '../../lib/random';
import { useSceneSettings } from '../../settings';
import { MAP } from '../../world/map';
import { MAX_FOOD_LIGHTS, foodLights } from '../floorGlow';
import { foggyShader } from '../glsl/material';
import { pointScale } from '../glsl/points';
import { planicieWeight } from '../regionTint';
import { seabedHeight } from '../terrain';

/** Flocos de neve pousados no sedimento, por perfil. */
const SETTLED = { high: 4000, low: 1500 } as const;
const PLAIN = MAP.regions.find((r) => r.id === 'planicie')!;

const vertex = /* glsl */ `
#define MAX_FOOD ${MAX_FOOD_LIGHTS}
attribute float aSize;
attribute float aSeed;
uniform float uTime;
uniform float uPointScale;
uniform vec4 uFoodPos[MAX_FOOD];
uniform vec3 uFoodCol[MAX_FOOD];
uniform int uFoodCount;
uniform vec3 uTint;
varying vec3 vColor;
#include <fog_pars_vertex>
void main() {
  // Mal se vê no escuro; perto da comida o floco pega a luz dela.
  vec3 lit = vec3(0.0);
  for (int i = 0; i < MAX_FOOD; i++) {
    if (i >= uFoodCount) break;
    float f = clamp(1.0 - distance(position.xz, uFoodPos[i].xy) / (uFoodPos[i].z * 1.3), 0.0, 1.0);
    lit += uFoodCol[i] * f * f * uFoodPos[i].w;
  }
  float shimmer = 0.75 + 0.25 * sin(uTime * 0.35 + aSeed * 70.0);
  vColor = uTint * 0.14 * shimmer + lit * 1.6;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float depth = -mvPosition.z;
  gl_PointSize = max(1.0, aSize * uPointScale / max(depth, 2.5));
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
varying vec3 vColor;
#include <fog_pars_fragment>
void main() {
  float a = smoothstep(0.5, 0.15, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <fog_fragment>
}
`;

/**
 * Planície da Neve Marinha ("Neve silenciosa"): o chão aberto já vem do leito e a neve que cai, de
 * Particles. Aqui fica a neve pousada no sedimento, num único Points sempre desenhado
 * (sem frustum culling: o material compila no primeiro quadro, não quando a Planície entra na tela).
 */
export function Planicie() {
  const { quality, motion } = useSceneSettings();

  const { geometry, material } = useMemo(() => {
    const rng = createRng(53);
    const count = SETTLED[quality];
    const pos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    const span = PLAIN.radius + 8;
    let i = 0;
    // Sorteio no quadrado em volta da Planície, aceito pelo peso dela: some na borda junto com o leito.
    for (let tries = 0; i < count && tries < count * 40; tries++) {
      const x = PLAIN.center[0] + (rng() * 2 - 1) * span;
      const z = PLAIN.center[1] + (rng() * 2 - 1) * span;
      if (rng() >= planicieWeight(x, z)) continue;
      pos[i * 3] = x;
      pos[i * 3 + 1] = seabedHeight(x, z) + 0.03;
      pos[i * 3 + 2] = z;
      sizes[i] = 0.03 + rng() ** 2 * 0.04;
      seeds[i] = rng();
      i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, i * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sizes.subarray(0, i), 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds.subarray(0, i), 1));
    const m = foggyShader({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPointScale: { value: 1 },
        uFoodPos: { value: foodLights.pos },
        uFoodCol: { value: foodLights.col },
        uFoodCount: { value: 0 },
        uTint: { value: new THREE.Color(PALETTE.fg) },
      },
    });
    return { geometry: g, material: m };
  }, [quality]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state, dt) => {
    material.uniforms.uTime.value += clampDelta(dt) * motion;
    material.uniforms.uPointScale.value = pointScale(state);
    material.uniforms.uFoodCount.value = foodLights.count;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
