import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../../lib/motion';
import { PALETTE } from '../../lib/palette';
import { createRng } from '../../lib/random';
import { useSceneSettings } from '../../settings';
import { foggyShader } from '../glsl/material';
import { pointScale } from '../glsl/points';

/** Volume onde a neve marinha deriva; as partículas dão a volta nas bordas. */
const BOX_MIN = new THREE.Vector3(-26, -0.5, -30);
const BOX_SIZE = new THREE.Vector3(52, 16, 44);

/** Três camadas: perto (grandes, raras), meio, longe (pequenas, numerosas). */
const LAYERS = [
  { share: 0.12, size: 0.07, zRange: [6, 14] },
  { share: 0.33, size: 0.05, zRange: [-6, 6] },
  { share: 0.55, size: 0.04, zRange: [-30, -6] },
] as const;

const vertex = /* glsl */ `
attribute float aSize;
attribute float aSeed;
uniform float uTime;
uniform float uPointScale;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
varying float vTwinkle;
#include <fog_pars_vertex>
void main() {
  vec3 current = vec3(0.12, -0.035, 0.05) * (0.6 + aSeed);
  vec3 p = position + current * uTime;
  p.x += sin(uTime * 0.3 + aSeed * 40.0) * 0.3;
  p.y += cos(uTime * 0.23 + aSeed * 17.0) * 0.2;
  p = uBoxMin + mod(p - uBoxMin, uBoxSize);
  vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed) + aSeed * 60.0);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = max(1.0, aSize * uPointScale / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform vec3 uColor;
varying float vTwinkle;
#include <fog_pars_fragment>
void main() {
  float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(uColor * a * vTwinkle * 0.55, 1.0);
  #include <fog_fragment>
}
`;

export function Particles() {
  const { q, motion } = useSceneSettings();
  const { geometry, material } = useMemo(() => {
    const rng = createRng(31);
    const count = q.particleCount;
    const pos = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    let i = 0;
    for (const layer of LAYERS) {
      const n = Math.round(count * layer.share);
      for (let k = 0; k < n && i < count; k++, i++) {
        pos[i * 3] = BOX_MIN.x + rng() * BOX_SIZE.x;
        pos[i * 3 + 1] = BOX_MIN.y + rng() * BOX_SIZE.y;
        pos[i * 3 + 2] = layer.zRange[0] + rng() * (layer.zRange[1] - layer.zRange[0]);
        sizes[i] = layer.size * (0.6 + rng() * 0.8);
        seeds[i] = rng();
      }
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
        uBoxMin: { value: BOX_MIN },
        uBoxSize: { value: BOX_SIZE },
        uColor: { value: new THREE.Color(PALETTE.fg).lerp(new THREE.Color(PALETTE.cyan), 0.35) },
      },
    });
    return { geometry: g, material: m };
  }, [q.particleCount]);

  useFrame((state, dt) => {
    material.uniforms.uTime.value += clampDelta(dt) * motion;
    material.uniforms.uPointScale.value = pointScale(state);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
