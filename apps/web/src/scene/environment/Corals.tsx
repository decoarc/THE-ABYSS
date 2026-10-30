import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clampDelta } from '../../lib/motion';
import { PALETTE } from '../../lib/palette';
import { createRng } from '../../lib/random';
import { useSceneSettings } from '../../settings';
import { foggyShader } from '../glsl/material';
import { seabedHeight } from '../terrain';
import { generateCoral, type CoralParams } from './coralGen';

interface Variety {
  params: CoralParams;
  body: string;
  glow: string;
}

const VARIETIES: Record<'cyan' | 'violet' | 'rose', Variety> = {
  cyan: {
    params: { depth: 6, branchAngle: 0.62, lengthDecay: 0.8, radius: 0.1, height: 2.6, flatten: 0.75, trunk: 0.07 },
    body: '#123c47',
    glow: '#5bb8d6',
  },
  violet: {
    params: { depth: 5, branchAngle: 0.7, lengthDecay: 0.8, radius: 0.09, height: 2.2, flatten: 0.6, trunk: 0.06 },
    body: '#211a3c',
    glow: PALETTE.violet,
  },
  rose: {
    params: { depth: 5, branchAngle: 0.8, lengthDecay: 0.74, radius: 0.07, height: 1.5, flatten: 0.3, trunk: 0.05 },
    body: '#2a1422',
    glow: '#a5507a',
  },
};

const PLACEMENTS: { x: number; z: number; kind: keyof typeof VARIETIES; seed: number; scale: number }[] = [
  { x: -3.4, z: 1.0, kind: 'cyan', seed: 4, scale: 1.5 },
  { x: 3.9, z: 0.6, kind: 'violet', seed: 9, scale: 1.5 },
  { x: -6.6, z: 3.4, kind: 'rose', seed: 2, scale: 1.1 },
  { x: 6.8, z: -4.8, kind: 'cyan', seed: 13, scale: 1.3 },
  { x: -7.2, z: -4.2, kind: 'violet', seed: 21, scale: 1.2 },
  { x: 2.6, z: 4.6, kind: 'rose', seed: 8, scale: 0.8 },
];

/** Um coral inteiro num único BufferGeometry: tubos por segmento + bulbos nas pontas. */
function coralGeometry(v: Variety, seed: number): THREE.BufferGeometry {
  const segments = generateCoral(createRng(seed), v.params);
  const maxY = Math.max(...segments.map((s) => s.end[1]));
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  const tag = (g: THREE.BufferGeometry, tipAt: (y: number) => number) => {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const tip = new Float32Array(pos.count);
    const height = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      tip[i] = tipAt(pos.getY(i));
      height[i] = pos.getY(i) / maxY;
    }
    g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
    g.setAttribute('aHeight', new THREE.BufferAttribute(height, 1));
    g.deleteAttribute('uv');
    return g;
  };

  for (const s of segments) {
    start.set(...s.start);
    end.set(...s.end);
    dir.subVectors(end, start);
    const length = dir.length();
    const tube = new THREE.CylinderGeometry(s.radius * 0.64, s.radius, length, 7, 1, true);
    tube.translate(0, length / 2, 0);
    quat.setFromUnitVectors(up, dir.normalize());
    tube.applyQuaternion(quat);
    tube.translate(start.x, start.y, start.z);
    const d0 = s.depth / v.params.depth;
    const d1 = (s.depth + 1) / v.params.depth;
    const y0 = start.y, y1 = end.y;
    parts.push(tag(tube, (y) => THREE.MathUtils.lerp(d0, d1, (y - y0) / (y1 - y0 || 1))));
    if (s.depth === v.params.depth) {
      const bulb = new THREE.IcosahedronGeometry(s.radius * 1.5, 1);
      bulb.translate(end.x, end.y, end.z);
      parts.push(tag(bulb, () => 1.25));
    }
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  parts.forEach((g) => g.dispose());
  merged.computeVertexNormals();
  return merged;
}

const vertex = /* glsl */ `
attribute float aTip;
attribute float aHeight;
uniform float uTime;
uniform float uPhase;
varying float vTip;
varying vec3 vNormalV;
varying vec3 vViewDir;
#include <fog_pars_vertex>
void main() {
  vTip = aTip;
  vec3 p = position;
  float h = aHeight * aHeight;
  p.x += sin(uTime * 0.55 + uPhase + position.y * 0.8) * 0.07 * h;
  p.z += cos(uTime * 0.43 + uPhase * 1.3 + position.y * 0.6) * 0.05 * h;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform vec3 uBody;
uniform vec3 uGlow;
uniform float uTime;
uniform float uPhase;
varying float vTip;
varying vec3 vNormalV;
varying vec3 vViewDir;
#include <fog_pars_fragment>
void main() {
  float rim = pow(1.0 - abs(dot(vNormalV, vViewDir)), 2.5);
  float tip = smoothstep(0.35, 1.25, vTip);
  float pulse = 0.85 + 0.15 * sin(uTime * 0.7 + uPhase + vTip * 3.0);
  vec3 color = uBody * (0.7 + 0.3 * vNormalV.y)
    + uGlow * (0.22 + rim * 0.35 + tip * tip * 0.9 * pulse);
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}
`;

function Coral({ x, z, kind, seed, scale }: (typeof PLACEMENTS)[number]) {
  const variety = VARIETIES[kind];
  const geometry = useMemo(() => coralGeometry(variety, seed), [variety, seed]);
  const material = useMemo(
    () =>
      foggyShader({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uTime: { value: 0 },
          uPhase: { value: seed * 0.77 },
          uBody: { value: new THREE.Color(variety.body) },
          uGlow: { value: new THREE.Color(variety.glow) },
        },
      }),
    [variety, seed],
  );
  const { motion } = useSceneSettings();
  useFrame((_, dt) => {
    material.uniforms.uTime.value += clampDelta(dt) * motion;
  });
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[x, seabedHeight(x, z) - 0.05, z]}
      rotation={[0, (seed % 5) * 0.25 - 0.5, 0]}
      scale={scale}
    />
  );
}

export function Corals() {
  return (
    <>
      {PLACEMENTS.map((p, i) => (
        <Coral key={i} {...p} />
      ))}
    </>
  );
}
