import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { PALETTE } from '../lib/palette';
import { useSceneSettings } from '../settings';
import { SNOISE } from '../scene/glsl/noise';
import { CREATURE_GLOW_RADIUS, glowOf } from '../scene/floorGlow';
import { foggyShader } from '../scene/glsl/material';
import { useCreatureCull } from '../scene/cull';
import { useWorld } from '../services/WorldProvider';
import { MEMBRANA as C } from './creatureConfig';
import { requestCreatureGlow } from './creatureGlow';
import { phaseOf } from './instancePhase';
import { Nucleus } from './Nucleus';
import { useOrganismPose } from './useOrganismPose';
import { useStretchFrame, useVitals } from './useVitals';
import { useSelectable } from './useSelectable';

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
uniform float uFade;
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
  gl_FragColor = vec4(color * alpha * uFade, 1.0);
  #include <fog_fragment>
}
`;

const FLOOR_COLOR = glowOf(PALETTE.cyan, 0, 0, 0, 0).color;

// Compartilhada por todas as instâncias (só os uniforms variam por instância).
let sharedGeometry: THREE.BufferGeometry | null = null;
const getGeometry = () => (sharedGeometry ??= new THREE.IcosahedronGeometry(C.radius, 24));

/** Membrana: bolha gelatinosa e translúcida que respira no ritmo do núcleo. Criatura herói. */
export function Membrana({ id }: { id: string }) {
  const { motion } = useSceneSettings();
  const pose = useOrganismPose(id);
  const vitals = useVitals(id);
  const { frame, counter, apply } = useStretchFrame();
  const selectable = useSelectable(id);
  const group = useRef<THREE.Group>(null);
  const shown = useCreatureCull(group, pose);
  const scale = useWorld().store.creatureScale();
  const pulse = useRef(C.nucleus.pulseMin);
  const offset = useMemo(() => phaseOf(id) * 1000, [id]);
  const time = useRef(offset);
  const geometry = getGeometry();
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
          uFade: { value: 1 },
          uThickness: { value: C.thickness },
          uRim: { value: new THREE.Color(PALETTE.cyan) },
          uInner: { value: new THREE.Color(PALETTE.violet) },
          uNucleus: { value: new THREE.Color(C.nucleus.color) },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    const step = clampDelta(dt) * motion;
    time.current += step;
    const t = time.current;
    const breath = (pulse.current - C.nucleus.pulseMin) / (C.nucleus.pulseMax - C.nucleus.pulseMin);
    material.uniforms.uTime.value = t;
    material.uniforms.uBreath.value = breath;
    material.uniforms.uFade.value = vitals.fade.current;

    const g = group.current;
    if (!g) return;
    if (!shown.current) return;
    // Posição canônica do servidor; a rotação lenta é cosmética.
    const f = frame.current;
    if (!f) return;
    f.position.copy(pose.pos);
    apply(pose.vel, vitals.stretch.current);
    g.scale.setScalar(scale * vitals.scale.current);
    g.rotation.set(Math.sin(t * 0.13) * 0.2, t * 0.05, Math.cos(t * 0.11) * 0.15);
    requestCreatureGlow(id, FLOOR_COLOR, f.position.x, f.position.y, f.position.z, CREATURE_GLOW_RADIUS, 1.3 * (0.6 + 0.4 * breath) * vitals.glow.current * vitals.fade.current);
  });

  return (
    <group ref={frame} {...selectable}>
      <group ref={counter}>
        <group ref={group} visible={false}>
          <mesh geometry={geometry} material={material} renderOrder={3} />
          <Nucleus config={C.nucleus} pulseRef={pulse} glowRef={vitals.glow} fadeRef={vitals.fade} timeOffset={offset} />
        </group>
      </group>
    </group>
  );
}
