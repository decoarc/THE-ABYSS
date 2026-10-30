import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { PALETTE } from '../lib/palette';
import { useSceneSettings } from '../settings';
import { SNOISE } from '../scene/glsl/noise';
import { FLOOR_SLOTS, glowOf, setCreatureGlow } from '../scene/floorGlow';
import { foggyShader } from '../scene/glsl/material';
import { MEMBRANA as C } from './creatureConfig';
import { Nucleus } from './Nucleus';

const vertex = /* glsl */ `
uniform float uTime;
uniform float uWobble;
uniform float uBreath;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vDisp;
#include <fog_pars_vertex>
${SNOISE}
void main() {
  float n1 = snoise(normal * 1.4 + vec3(0.0, uTime * 0.22, uTime * 0.11));
  float n2 = snoise(normal * 3.2 - vec3(uTime * 0.35, 0.0, uTime * 0.2));
  float disp = (n1 + 0.35 * n2) * uWobble;
  vDisp = disp;
  // Leve achatamento vertical para não ler como bolha perfeita.
  vec3 p = position * (1.0 + disp + uBreath * 0.07) * vec3(1.0, 0.86, 1.0);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform vec3 uRim;
uniform vec3 uInner;
uniform vec3 uNucleus;
uniform float uBreath;
uniform float uThickness;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying float vDisp;
#include <fog_pars_fragment>
void main() {
  float facing = abs(dot(vNormalV, vViewDir));
  float fresnel = pow(1.0 - facing, uThickness);
  // Luz do núcleo atravessando o centro do corpo, mais forte no pico do pulso.
  float core = pow(facing, 3.0) * (0.04 + 0.1 * uBreath);
  vec3 color = uInner * 0.14 + uRim * fresnel * (0.55 + 0.25 * uBreath) + uNucleus * core
    + uRim * max(vDisp, 0.0) * 0.4;
  float alpha = clamp(0.05 + fresnel * 0.75 + core, 0.0, 1.0);
  gl_FragColor = vec4(color * alpha, 1.0);
  #include <fog_fragment>
}
`;

const FLOOR_COLOR = glowOf(PALETTE.cyan, 0, 0, 0, 0).color;

/** Membrana: bolha gelatinosa e translúcida que respira no ritmo do núcleo. Criatura herói. */
export function Membrana() {
  const { motion } = useSceneSettings();
  const group = useRef<THREE.Group>(null);
  const pulse = useRef(C.nucleus.pulseMin);
  const time = useRef(0);
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(C.radius, 24), []);
  const material = useMemo(
    () =>
      foggyShader({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        // Aditivo: o corpo gelatinoso nunca escurece o que está atrás dele.
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uWobble: { value: C.wobble },
          uBreath: { value: 0 },
          uThickness: { value: C.thickness },
          uRim: { value: new THREE.Color(PALETTE.cyan) },
          uInner: { value: new THREE.Color(PALETTE.violet) },
          uNucleus: { value: new THREE.Color(C.nucleus.color) },
        },
      }),
    [],
  );

  useFrame((_, dt) => {
    const step = clampDelta(dt) * motion;
    time.current += step;
    const t = time.current;
    const breath = (pulse.current - C.nucleus.pulseMin) / (C.nucleus.pulseMax - C.nucleus.pulseMin);
    material.uniforms.uTime.value = t;
    material.uniforms.uBreath.value = breath;

    const g = group.current;
    if (!g) return;
    // Órbita larga e lenta em volta da chaminé herói, com oscilação de altura e de raio.
    const a = 0.9 + t * C.driftSpeed;
    const r = C.driftRadius + Math.sin(t * 0.07) * 0.8;
    g.position.set(Math.cos(a) * r, 4.5 + Math.sin(t * 0.21) * 0.45, Math.sin(a) * r * 0.75 + 0.5);
    g.rotation.set(Math.sin(t * 0.13) * 0.2, t * 0.05, Math.cos(t * 0.11) * 0.15);
    setCreatureGlow(FLOOR_SLOTS.membrana, FLOOR_COLOR, g.position.x, g.position.y, g.position.z, 1.3 * (0.6 + 0.4 * breath));
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={material} renderOrder={3} />
      <Nucleus config={C.nucleus} pulseRef={pulse} />
    </group>
  );
}
