import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { createRng } from '../lib/random';
import { FLOOR_SLOTS, glowOf, setCreatureGlow } from '../scene/floorGlow';
import { foggyShader } from '../scene/glsl/material';
import { SNOISE } from '../scene/glsl/noise';
import { useSceneSettings } from '../settings';
import { cellPose } from './cellPose';
import { CELULA as C } from './creatureConfig';
import { Nucleus } from './Nucleus';

const FLOOR_COLOR = glowOf(C.nucleus.color, 0, 0, 0, 0).color;
const FLAGELLUM_LENGTH = 1.1;
const UP = new THREE.Vector3(0, 1, 0);

const bodyVertex = /* glsl */ `
uniform float uLength;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vLocal;
#include <fog_pars_vertex>
${SNOISE}
void main() {
  vLocal = position;
  // Frente (y > 0) um pouco mais gorda que a traseira, e relevo baixo: não pode ler como pílula.
  float swell = 1.0 + 0.2 * position.y / uLength;
  float bump = 1.0 + 0.08 * snoise(position * 2.0) + 0.03 * snoise(position * 6.0);
  vec3 p = vec3(position.x * swell * bump, position.y, position.z * swell * bump);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const bodyFragment = /* glsl */ `
uniform vec3 uSkin;
uniform vec3 uSheen;
uniform vec3 uNucleus;
uniform float uPulse;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vLocal;
#include <fog_pars_fragment>
${SNOISE}
void main() {
  float facing = abs(dot(vNormalV, vViewDir));
  float rim = 1.0 - facing;
  // Pele cerosa: manchas suaves, brilho especular largo e fraco na borda.
  float mottle = snoise(vLocal * 3.0) * 0.5 + 0.5;
  vec3 skin = uSkin * (0.6 + 0.6 * mottle) * (0.4 + 0.4 * max(vNormalV.y, 0.0));
  // Luz do núcleo atravessando a parede, mais forte onde ela é vista de frente (mais fina).
  vec3 inner = uNucleus * facing * facing * (0.12 + 0.22 * uPulse);
  vec3 sheen = uSheen * pow(rim, 3.0) * 0.35;
  float alpha = clamp(0.5 + rim * 0.45, 0.0, 1.0);
  gl_FragColor = vec4(skin + inner + sheen, alpha);
  #include <fog_fragment>
}
`;

const flagellumVertex = /* glsl */ `
uniform float uTime;
uniform float uPhase;
uniform float uLength;
varying float vT;
#include <fog_pars_vertex>
void main() {
  // y vai de 0 (raiz) a -uLength (ponta); a onda cresce em direção à ponta.
  float t = clamp(-position.y / uLength, 0.0, 1.0);
  vT = t;
  vec3 p = position;
  p.x += sin(uTime * 5.0 - t * 7.0 + uPhase) * 0.18 * t;
  p.z += cos(uTime * 4.0 - t * 6.0 + uPhase) * 0.1 * t;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const flagellumFragment = /* glsl */ `
uniform vec3 uColor;
varying float vT;
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(uColor * (0.5 + 0.5 * vT), 0.75 * (1.0 - vT * 0.7));
  #include <fog_fragment>
}
`;

/** Célula: cápsula cerosa e sólida, grânulos e núcleo por dentro, flagelos batendo atrás. */
export function Celula() {
  const { motion } = useSceneSettings();
  const group = useRef<THREE.Group>(null);
  const granules = useRef<THREE.InstancedMesh>(null);
  const pulse = useRef(C.nucleus.pulseMin);
  const time = useRef(0);

  const shaft = C.length - 2 * C.radius;
  const body = useMemo(() => new THREE.CapsuleGeometry(C.radius, shaft, 10, 28), [shaft]);
  const bodyMaterial = useMemo(
    () =>
      foggyShader({
        vertexShader: bodyVertex,
        fragmentShader: bodyFragment,
        transparent: true,
        uniforms: {
          uLength: { value: C.length },
          uSkin: { value: new THREE.Color('#3f5a4a') },
          uSheen: { value: new THREE.Color('#cfe6c8') },
          uNucleus: { value: new THREE.Color(C.nucleus.color) },
          uPulse: { value: 0 },
        },
      }),
    [],
  );

  const flagellum = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.008, 0.022, FLAGELLUM_LENGTH, 5, 24, true);
    g.translate(0, -FLAGELLUM_LENGTH / 2, 0);
    return g;
  }, []);
  const flagellumMaterials = useMemo(
    () =>
      Array.from({ length: C.flagella }, (_, i) =>
        foggyShader({
          vertexShader: flagellumVertex,
          fragmentShader: flagellumFragment,
          transparent: true,
          depthWrite: false,
          uniforms: {
            uTime: { value: 0 },
            uPhase: { value: i * 2.1 },
            uLength: { value: FLAGELLUM_LENGTH },
            uColor: { value: new THREE.Color('#5d6d4c') },
          },
        }),
      ),
    [],
  );

  const granuleGeometry = useMemo(() => new THREE.IcosahedronGeometry(0.045, 1), []);
  useLayoutEffect(() => {
    const m = granules.current;
    if (!m) return;
    const rng = createRng(3141);
    const matrix = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const dark = new THREE.Color('#1c2416');
    const lit = new THREE.Color(C.nucleus.color).multiplyScalar(0.7);
    for (let i = 0; i < C.granules; i++) {
      // Espalhados no interior do cilindro central, longe da parede.
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * C.radius * 0.6;
      p.set(Math.cos(a) * r, (rng() - 0.5) * shaft * 1.1, Math.sin(a) * r);
      s.setScalar(0.6 + rng() * 0.9);
      m.setMatrixAt(i, matrix.compose(p, q, s));
      m.setColorAt(i, rng() < 0.3 ? lit : dark);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [shaft]);

  const scratch = useMemo(
    () => ({ heading: new THREE.Vector3(), q: new THREE.Quaternion(), roll: new THREE.Quaternion() }),
    [],
  );

  useFrame((_, dt) => {
    const step = clampDelta(dt) * motion;
    time.current += step;
    const g = group.current;
    if (!g) return;
    const pose = cellPose(time.current, C);
    g.position.set(...pose.position);
    scratch.heading.set(...pose.heading);
    scratch.q.setFromUnitVectors(UP, scratch.heading);
    scratch.roll.setFromAxisAngle(UP, pose.roll);
    g.quaternion.copy(scratch.q).multiply(scratch.roll);

    const breath = (pulse.current - C.nucleus.pulseMin) / (C.nucleus.pulseMax - C.nucleus.pulseMin);
    bodyMaterial.uniforms.uPulse.value = breath;
    for (const m of flagellumMaterials) m.uniforms.uTime.value = time.current;
    setCreatureGlow(FLOOR_SLOTS.celula, FLOOR_COLOR, g.position.x, g.position.y, g.position.z, 0.5 + 0.3 * breath);
  });

  return (
    <group ref={group}>
      {/* Conteúdo interno primeiro; a pele translúcida é desenhada por cima. */}
      <instancedMesh ref={granules} args={[granuleGeometry, undefined, C.granules]} renderOrder={1}>
        <meshBasicMaterial />
      </instancedMesh>
      <group position={[0, shaft * 0.2, 0]}>
        <Nucleus config={C.nucleus} pulseRef={pulse} haloScale={4} />
      </group>
      <mesh geometry={body} material={bodyMaterial} renderOrder={2} />
      {flagellumMaterials.map((m, i) => {
        const a = (i / C.flagella) * Math.PI * 2;
        return (
          <mesh
            key={i}
            geometry={flagellum}
            material={m}
            position={[Math.cos(a) * C.radius * 0.35, -C.length / 2 + 0.05, Math.sin(a) * C.radius * 0.35]}
            rotation={[Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]}
            renderOrder={2}
          />
        );
      })}
    </group>
  );
}
