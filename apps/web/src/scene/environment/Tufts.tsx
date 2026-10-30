import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clampDelta } from '../../lib/motion';
import { PALETTE } from '../../lib/palette';
import { createRng } from '../../lib/random';
import { useSceneSettings } from '../../settings';
import { foggyShader } from '../glsl/material';
import { seabedHeight } from '../terrain';
import { VENTS, scatter } from './layout';

const STALKS = 7;
const PATCHES = 18;

/** Um feixe de hastes finas com bulbo na ponta; `aTip` vai de 0 (base) a 1 (bulbo). */
function tuftGeometry(): THREE.BufferGeometry {
  const rng = createRng(606);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < STALKS; i++) {
    const h = 0.55 + rng() * 0.45;
    const lean = new THREE.Euler((rng() - 0.5) * 0.7, 0, (rng() - 0.5) * 0.7);
    const stalk = new THREE.CylinderGeometry(0.006, 0.014, h, 4, 3, true);
    stalk.translate(0, h / 2, 0);
    const bulb = new THREE.IcosahedronGeometry(0.03 + rng() * 0.015, 0);
    bulb.translate(0, h, 0);
    for (const [g, isBulb] of [[stalk, false], [bulb, true]] as const) {
      g.rotateX(lean.x);
      g.rotateZ(lean.z);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const tip = new Float32Array(pos.count);
      for (let k = 0; k < pos.count; k++) tip[k] = isBulb ? 1 : (pos.getY(k) / h) * 0.6;
      g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
      g.deleteAttribute('uv');
      parts.push(g.index ? g.toNonIndexed() : g);
    }
  }
  const merged = mergeGeometries(parts);
  merged.computeVertexNormals();
  return merged;
}

const vertex = /* glsl */ `
attribute float aTip;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
varying float vTip;
varying vec3 vColor;
varying float vPhase;
#include <fog_pars_vertex>
void main() {
  vTip = aTip;
  vColor = aColor;
  vPhase = aPhase;
  vec3 p = position;
  float bend = aTip * aTip;
  p.x += sin(uTime * 0.9 + aPhase * 6.2831) * 0.06 * bend;
  p.z += cos(uTime * 0.7 + aPhase * 4.0) * 0.04 * bend;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform float uTime;
uniform vec3 uStalk;
varying float vTip;
varying vec3 vColor;
varying float vPhase;
#include <fog_pars_fragment>
void main() {
  float bulb = step(0.99, vTip);
  float twinkle = 0.7 + 0.3 * sin(uTime * 1.3 + vPhase * 40.0);
  vec3 color = mix(uStalk + vColor * vTip * 0.15, vColor * 1.6 * twinkle, bulb);
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}
`;

/** Tufos: feixes com ponta luminosa, agrupados em manchas perto das chaminés. */
export function Tufts() {
  const { q, motion } = useSceneSettings();
  const count = q.tuftCount;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = tuftGeometry();
    const rng = createRng(607);
    const phase = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const cyan = new THREE.Color(PALETTE.cyan);
    const amber = new THREE.Color(PALETTE.amber);
    for (let i = 0; i < count; i++) {
      phase[i] = rng();
      (rng() < 0.78 ? cyan : amber).toArray(color, i * 3);
    }
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
    return g;
  }, [count]);
  const material = useMemo(
    () =>
      foggyShader({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uTime: { value: 0 }, uStalk: { value: new THREE.Color('#0b1f24') } },
      }),
    [],
  );

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const rng = createRng(608);
    const avoid = VENTS.map((v) => ({ center: [v.position[0], v.position[2]] as [number, number], radius: v.radius * 1.9 }));
    const centers = scatter(rng, PATCHES, { minR: 1.6, maxR: 13, avoid });
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const pos = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const [cx, cz] = centers[i % PATCHES];
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(-2 * Math.log(1 - rng() * 0.98)) * 0.45;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const s = 0.45 + rng() * 0.6;
      scale.set(s, s * (0.8 + rng() * 0.5), s);
      quat.setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0));
      pos.set(x, seabedHeight(x, z) - 0.03, z);
      m.setMatrixAt(i, matrix.compose(pos, quat, scale));
    }
    m.instanceMatrix.needsUpdate = true;
  }, [count]);

  useFrame((_, dt) => {
    material.uniforms.uTime.value += clampDelta(dt) * motion;
  });

  return <instancedMesh key={count} ref={mesh} args={[geometry, material, count]} frustumCulled={false} />;
}
