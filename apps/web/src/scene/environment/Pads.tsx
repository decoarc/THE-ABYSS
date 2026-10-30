import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../../lib/motion';
import { PALETTE } from '../../lib/palette';
import { createRng } from '../../lib/random';
import { useSceneSettings } from '../../settings';
import { foggyShader } from '../glsl/material';
import { seabedHeight } from '../terrain';
import { VENTS, scatter } from './layout';

const COUNT = 46;

const vertex = /* glsl */ `
attribute float aPhase;
attribute vec3 aColor;
varying float vPhase;
varying vec3 vColor;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vTop;
#include <fog_pars_vertex>
void main() {
  vPhase = aPhase;
  vColor = aColor;
  vTop = normal.y;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform float uTime;
varying float vPhase;
varying vec3 vColor;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vTop;
#include <fog_pars_fragment>
void main() {
  float pulse = 0.55 + 0.45 * sin(uTime * 0.5 + vPhase * 6.2831);
  float top = smoothstep(0.2, 1.0, vTop);
  float rim = pow(1.0 - abs(dot(vNormalV, vViewDir)), 2.0);
  vec3 color = vColor * (0.08 + top * 0.75 * pulse + rim * 0.35);
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}
`;

/** Almofadas: discos achatados e luminosos no leito, pulsando fora de fase. */
export function Pads() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 20, 10);
    g.scale(1, 0.32, 1);
    g.translate(0, 0.08, 0);
    const phase = new Float32Array(COUNT);
    const color = new Float32Array(COUNT * 3);
    const rng = createRng(404);
    const cyan = new THREE.Color(PALETTE.cyan);
    const violet = new THREE.Color(PALETTE.violet);
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      phase[i] = rng();
      c.copy(cyan).lerp(violet, rng() < 0.65 ? rng() * 0.25 : 0.7 + rng() * 0.3);
      c.toArray(color, i * 3);
    }
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
    return g;
  }, []);
  const material = useMemo(
    () => foggyShader({ vertexShader: vertex, fragmentShader: fragment, uniforms: { uTime: { value: 0 } } }),
    [],
  );

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const rng = createRng(405);
    const avoid = VENTS.map((v) => ({ center: [v.position[0], v.position[2]] as [number, number], radius: v.radius * 2 }));
    // Mais concentradas no anel em torno das chaminés.
    const near = scatter(rng, Math.round(COUNT * 0.7), { minR: 2, maxR: 11, avoid });
    const far = scatter(rng, COUNT - near.length, { minR: 11, maxR: 26, avoid });
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    [...near, ...far].forEach(([x, z], i) => {
      const s = 0.12 + rng() ** 2 * 0.35;
      scale.set(s * (0.8 + rng() * 0.4), s, s * (0.8 + rng() * 0.4));
      quat.setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0));
      pos.set(x, seabedHeight(x, z) - 0.02, z);
      m.setMatrixAt(i, matrix.compose(pos, quat, scale));
    });
    m.instanceMatrix.needsUpdate = true;
  }, []);

  const { motion } = useSceneSettings();
  useFrame((_, dt) => {
    material.uniforms.uTime.value += clampDelta(dt) * Math.max(motion, 0.15);
  });

  return <instancedMesh ref={mesh} args={[geometry, material, COUNT]} frustumCulled={false} />;
}
