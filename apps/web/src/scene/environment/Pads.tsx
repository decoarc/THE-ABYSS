import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../../lib/motion';
import { PALETTE } from '../../lib/palette';
import { createNoise2D } from '../../lib/noise';
import { createRng } from '../../lib/random';
import { useSceneSettings } from '../../settings';
import { foggyShader } from '../glsl/material';
import { FLOOR_SLOTS, floorGlows, glowOf } from '../floorGlow';
import { seabedHeight } from '../terrain';
import { VENTS, scatter } from './layout';

const COUNT = 34;

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
  float edge = 1.0 - smoothstep(0.25, 0.85, vTop);
  vec3 color = vColor * (0.05 + top * 0.12 * pulse + edge * (0.55 + 0.45 * pulse) + rim * 0.3);
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}
`;

/** Almofadas: discos achatados e luminosos no leito, pulsando fora de fase. */
export function Pads() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    // Almofada irregular: esfera achatada com borda ondulada por ruído.
    const g = new THREE.SphereGeometry(1, 28, 12);
    const noise = createNoise2D(41);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.28 * noise(Math.cos(a) * 1.6 + 3, Math.sin(a) * 1.6) + 0.12 * noise(x * 3, z * 3);
      pos.setXYZ(i, x * k, Math.max(y, -0.2) * 0.38, z * k);
    }
    g.computeVertexNormals();
    g.translate(0, 0.06, 0);
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
    // Maioria num canteiro à frente das chaminés (primeiro plano), o resto espalhado.
    const near = scatter(rng, COUNT * 4, { minR: 2.4, maxR: 9, avoid })
      .filter(([x, z]) => z > 1.8 && Math.abs(x) < 6)
      .slice(0, Math.round(COUNT * 0.7));
    const far = scatter(rng, COUNT - near.length, { minR: 9, maxR: 24, avoid });
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    [...near, ...far].forEach(([x, z], i) => {
      const s = 0.18 + rng() ** 2 * 0.5;
      scale.set(s * (0.8 + rng() * 0.4), s, s * (0.8 + rng() * 0.4));
      quat.setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0));
      pos.set(x, seabedHeight(x, z) - 0.02, z);
      m.setMatrixAt(i, matrix.compose(pos, quat, scale));
    });
    m.instanceMatrix.needsUpdate = true;

    // O canteiro da frente tinge o chão em volta: um brilho largo ciano e um violeta deslocado.
    const cx = near.reduce((s, [x]) => s + x, 0) / near.length;
    const cz = near.reduce((s, [, z]) => s + z, 0) / near.length;
    floorGlows.set(FLOOR_SLOTS.pads, glowOf(PALETTE.cyan, cx - 1.2, cz, 5, 0.5));
    floorGlows.set(FLOOR_SLOTS.pads + 1, glowOf(PALETTE.violet, cx + 1.8, cz + 0.6, 4, 0.45));
    return () => {
      floorGlows.clear(FLOOR_SLOTS.pads);
      floorGlows.clear(FLOOR_SLOTS.pads + 1);
    };
  }, []);

  const { motion } = useSceneSettings();
  useFrame((_, dt) => {
    material.uniforms.uTime.value += clampDelta(dt) * Math.max(motion, 0.15);
  });

  return <instancedMesh ref={mesh} args={[geometry, material, COUNT]} frustumCulled={false} />;
}
