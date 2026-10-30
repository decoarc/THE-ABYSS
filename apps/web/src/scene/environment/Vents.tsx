import { useMemo } from 'react';
import { getHaloTexture } from '../../organisms/Nucleus';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../../lib/motion';
import { createNoise2D } from '../../lib/noise';
import { PALETTE } from '../../lib/palette';
import { createRng } from '../../lib/random';
import { useSceneSettings } from '../../settings';
import { foggyShader } from '../glsl/material';
import { SNOISE } from '../glsl/noise';
import { pointScale } from '../glsl/points';
import { VENTS, type VentSpec } from './layout';

const RADIAL = 11;
const RINGS = 20;

/** Coluna irregular: anéis empilhados, base alargada, boca aberta no topo. */
function ventGeometry(spec: VentSpec, seed: number): THREE.BufferGeometry {
  const noise = createNoise2D(seed);
  const positions: number[] = [];
  const heights: number[] = [];
  const indices: number[] = [];
  for (let ring = 0; ring <= RINGS; ring++) {
    const v = ring / RINGS;
    const y = v * spec.height;
    const flare = 1 + 0.9 * (1 - v) ** 5;
    const lip = v > 0.94 ? 1 + (v - 0.94) * 2 : 1;
    const taper = 1 - 0.3 * v;
    const sway = noise(v * 1.6, 3.1) * spec.height * 0.05;
    for (let s = 0; s < RADIAL; s++) {
      const a = (s / RADIAL) * Math.PI * 2;
      const bump = 1 + 0.3 * noise(Math.cos(a) * 1.3 + 7, v * 4.5) + 0.14 * noise(s * 0.9, ring * 0.7);
      const r = spec.radius * flare * lip * taper * bump;
      positions.push(Math.cos(a) * r + sway, y, Math.sin(a) * r);
      heights.push(v);
    }
  }
  for (let ring = 0; ring < RINGS; ring++) {
    for (let s = 0; s < RADIAL; s++) {
      const a = ring * RADIAL + s;
      const b = ring * RADIAL + ((s + 1) % RADIAL);
      indices.push(a, a + RADIAL, b, b, a + RADIAL, b + RADIAL);
    }
  }
  // Fundo da boca: um leque um pouco abaixo da borda, onde o calor aparece.
  const top = RINGS * RADIAL;
  const center = positions.length / 3;
  positions.push(noise(1.6, 3.1) * spec.height * 0.05, spec.height * 0.92, 0);
  heights.push(1.2);
  for (let s = 0; s < RADIAL; s++) indices.push(center, top + ((s + 1) % RADIAL), top + s);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1));
  g.setIndex(indices);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

const ventVertex = /* glsl */ `
attribute float aHeight;
varying float vHeight;
varying vec3 vLocal;
varying vec3 vNormalW;
#include <fog_pars_vertex>
void main() {
  vHeight = aHeight;
  vLocal = position;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const ventFragment = /* glsl */ `
uniform float uTime;
uniform float uSeed;
uniform vec3 uRock;
uniform vec3 uHeat;
uniform float uHeatStrength;
varying float vHeight;
varying vec3 vLocal;
varying vec3 vNormalW;
#include <fog_pars_fragment>
${SNOISE}
void main() {
  float light = 0.25 + 0.6 * max(dot(vNormalW, normalize(vec3(0.3, 1.0, -0.2))), 0.0);
  float grain = snoise(vLocal * 3.5 + uSeed) * 0.5 + 0.5;
  vec3 base = uRock * light * (0.7 + 0.5 * grain);

  // Fissuras: bandas finas de ruído esticadas na vertical, tremulando devagar.
  float n = snoise(vec3(vLocal.x * 3.2, vLocal.y * 0.12 - uTime * 0.03, vLocal.z * 3.2) + uSeed);
  float crack = (1.0 - smoothstep(0.0, 0.055, abs(n))) * smoothstep(-0.5, 0.2, snoise(vLocal * vec3(0.8, 0.3, 0.8) + uSeed * 3.0));
  float flicker = 0.75 + 0.25 * snoise(vec3(vLocal.y * 0.8, uTime * 0.4, uSeed));
  float upward = smoothstep(0.05, 0.9, vHeight);
  float rim = smoothstep(0.95, 1.0, vHeight) * (1.0 - step(1.1, vHeight));
  float mouth = step(1.1, vHeight);
  vec3 heat = uHeat * uHeatStrength * (crack * flicker * (0.5 + 1.6 * upward) + rim * 0.3 + mouth * 3.2);

  gl_FragColor = vec4(base + heat, 1.0);
  #include <fog_fragment>
}
`;

const plumeVertex = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uHeight;
uniform float uPointScale;
varying float vFade;
#include <fog_pars_vertex>
void main() {
  float life = fract(uTime * (0.1 + 0.07 * fract(aSeed * 7.3)) + aSeed);
  float spread = 0.2 + life * 1.1;
  vec3 p = vec3(
    position.x * spread + sin(uTime * 0.6 + aSeed * 30.0) * 0.3 * life,
    uHeight * 0.92 + life * uHeight * 1.5,
    position.z * spread + cos(uTime * 0.5 + aSeed * 21.0) * 0.3 * life
  );
  vFade = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.3, 1.0, life));
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (0.25 + 0.6 * life) * uPointScale / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const plumeFragment = /* glsl */ `
uniform vec3 uColor;
varying float vFade;
#include <fog_pars_fragment>
void main() {
  float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(uColor * a * vFade * 0.07, 1.0);
  #include <fog_fragment>
}
`;

function Plume({ spec, seed }: { spec: VentSpec; seed: number }) {
  const count = spec.hero ? 90 : 40;
  const { geometry, material } = useMemo(() => {
    const rng = createRng(seed + 100);
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * spec.radius * 0.6;
      pos.set([Math.cos(a) * r, 0, Math.sin(a) * r], i * 3);
      seeds[i] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const m = foggyShader({
      vertexShader: plumeVertex,
      fragmentShader: plumeFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uHeight: { value: spec.height },
        uPointScale: { value: 1 },
        uColor: { value: new THREE.Color(PALETTE.amber).lerp(new THREE.Color('#4a3328'), 0.4) },
      },
    });
    return { geometry: g, material: m };
  }, [count, seed, spec.height, spec.radius]);
  const { motion } = useSceneSettings();
  useFrame((state, dt) => {
    material.uniforms.uTime.value += clampDelta(dt) * motion;
    material.uniforms.uPointScale.value = pointScale(state);
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

function Vent({ spec, seed }: { spec: VentSpec; seed: number }) {
  const geometry = useMemo(() => ventGeometry(spec, seed), [spec, seed]);
  const material = useMemo(
    () =>
      foggyShader({
        vertexShader: ventVertex,
        fragmentShader: ventFragment,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: seed * 1.7 },
          uRock: { value: new THREE.Color('#0e1b22') },
          uHeat: { value: new THREE.Color(PALETTE.amber) },
          uHeatStrength: { value: spec.hero ? 1.0 : 0.75 },
        },
      }),
    [seed, spec.hero],
  );
  const { motion } = useSceneSettings();
  useFrame((_, dt) => {
    // Fissuras continuam tremulando de leve mesmo com movimento reduzido.
    material.uniforms.uTime.value += clampDelta(dt) * Math.max(motion, 0.15);
  });

  return (
    <group position={spec.position}>
      <mesh geometry={geometry} material={material} position={[0, -0.3, 0]} />
      {/* Brasa na boca: halo quente pequeno, subordinado aos núcleos das criaturas. */}
      <sprite position={[0, spec.height - 0.25, 0]} scale={spec.radius * (spec.hero ? 6 : 4.5)}>
        <spriteMaterial
          map={getHaloTexture()}
          color={PALETTE.amber}
          opacity={spec.hero ? 0.55 : 0.4}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <Plume spec={spec} seed={seed} />
    </group>
  );
}

export function Vents() {
  return (
    <>
      {VENTS.map((spec, i) => (
        <Vent key={i} spec={spec} seed={i + 1} />
      ))}
    </>
  );
}
