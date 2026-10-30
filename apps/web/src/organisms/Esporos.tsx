import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { createRng } from '../lib/random';
import { useSceneSettings } from '../settings';
import { foggyShader } from '../scene/glsl/material';
import { createBoids, stepBoids } from './boids';
import { ESPOROS as C } from './creatureConfig';
import { MIN_PULSE_RATE } from './Nucleus';

const coreVertex = /* glsl */ `
attribute vec3 aColor;
attribute float aPhase;
uniform float uTime;
uniform float uHz;
uniform float uMin;
uniform float uMax;
varying vec3 vColor;
#include <fog_pars_vertex>
void main() {
  float s = 0.5 - 0.5 * cos(6.2831 * (uHz * uTime + aPhase));
  vColor = aColor * mix(uMin, uMax, s * s * (3.0 - 2.0 * s));
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const coreFragment = /* glsl */ `
varying vec3 vColor;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(vColor, 1.0);
  #include <fog_fragment>
}
`;

const shellVertex = /* glsl */ `
attribute vec3 aColor;
varying vec3 vColor;
varying vec3 vNormalV;
varying vec3 vViewDir;
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const shellFragment = /* glsl */ `
varying vec3 vColor;
varying vec3 vNormalV;
varying vec3 vViewDir;
#include <fog_pars_fragment>
void main() {
  float rim = pow(1.0 - abs(dot(vNormalV, vViewDir)), 2.0);
  gl_FragColor = vec4(vColor * (0.15 + rim * 0.6), 0.12 + rim * 0.55);
  #include <fog_fragment>
}
`;

/** Cardume de esporos: núcleo mínimo + casca fina, instanciados, guiados por boids. */
export function Esporos() {
  const { q, motion } = useSceneSettings();
  const count = q.sporeCount;
  const core = useRef<THREE.InstancedMesh>(null);
  const shell = useRef<THREE.InstancedMesh>(null);

  const sim = useMemo(() => {
    const rng = createRng(2024);
    return { rng, state: createBoids(count, rng, C.boids), time: 0 };
  }, [count]);

  const { coreGeometry, shellGeometry } = useMemo(() => {
    const rng = createRng(2025);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    // Entre ciano e âmbar, ambos dessaturados, para o cardume não competir com os núcleos maiores.
    const a = new THREE.Color('#5fbdb8');
    const b = new THREE.Color('#c08a62');
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.copy(a).lerp(b, rng() < 0.75 ? rng() * 0.3 : 0.6 + rng() * 0.4);
      c.toArray(colors, i * 3);
      phases[i] = rng();
    }
    const coreGeometry = new THREE.IcosahedronGeometry(C.nucleus.radius, 1);
    coreGeometry.translate(0, 0, C.shellRadius * 0.35);
    const shellGeometry = new THREE.SphereGeometry(C.shellRadius, 10, 8);
    shellGeometry.scale(1, 0.8, 1.5);
    for (const g of [coreGeometry, shellGeometry]) {
      g.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
      g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    }
    return { coreGeometry, shellGeometry };
  }, [count]);

  const materials = useMemo(
    () => ({
      core: foggyShader({
        vertexShader: coreVertex,
        fragmentShader: coreFragment,
        uniforms: {
          uTime: { value: 0 },
          uHz: { value: C.nucleus.pulseHz },
          uMin: { value: C.nucleus.pulseMin },
          uMax: { value: C.nucleus.pulseMax },
        },
      }),
      shell: foggyShader({
        vertexShader: shellVertex,
        fragmentShader: shellFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {},
      }),
    }),
    [],
  );

  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(1, 1, 1),
      fwd: new THREE.Vector3(0, 0, 1),
    }),
    [],
  );

  const writeMatrices = () => {
    const { pos, vel } = sim.state;
    const { m, p, dir, q: quat, s, fwd } = scratch;
    for (let i = 0; i < count; i++) {
      p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      dir.set(vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]);
      if (dir.lengthSq() > 1e-8) quat.setFromUnitVectors(fwd, dir.normalize());
      m.compose(p, quat, s);
      core.current?.setMatrixAt(i, m);
      shell.current?.setMatrixAt(i, m);
    }
    if (core.current) core.current.instanceMatrix.needsUpdate = true;
    if (shell.current) shell.current.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(writeMatrices);

  useFrame((_, dt) => {
    const step = clampDelta(dt);
    stepBoids(sim.state, step * motion, C.boids, sim.rng);
    materials.core.uniforms.uTime.value += step * Math.max(motion, MIN_PULSE_RATE);
    writeMatrices();
  });

  return (
    <group key={count}>
      <instancedMesh ref={core} args={[coreGeometry, materials.core, count]} frustumCulled={false} />
      <instancedMesh ref={shell} args={[shellGeometry, materials.shell, count]} frustumCulled={false} renderOrder={3} />
    </group>
  );
}
