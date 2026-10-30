import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm2D } from '../lib/noise';
import { PALETTE } from '../lib/palette';
import { SEABED_RADIUS } from './cameraConfig';
import { SHAFTS, shaftFootprint } from './environment/shaftLayout';
import { MAX_FLOOR_GLOWS, floorGlows } from './floorGlow';
import { foggyShader } from './glsl/material';
import { SNOISE } from './glsl/noise';
import { seabedHeight, terrainNoise as noise } from './terrain';

const vertex = /* glsl */ `
attribute vec3 color;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <fog_pars_vertex>
void main() {
  vColor = color;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
#define SHAFT_COUNT ${SHAFTS.length}
#define MAX_GLOWS ${MAX_FLOOR_GLOWS}
uniform vec4 uShafts[SHAFT_COUNT];
uniform vec3 uPoolColor;
uniform float uPoolStrength;
uniform vec4 uGlowPos[MAX_GLOWS];
uniform vec3 uGlowCol[MAX_GLOWS];
uniform int uGlowCount;
uniform float uGlowStrength;
uniform vec3 uSky;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <fog_pars_fragment>
${SNOISE}
void main() {
  vec2 p = vWorld.xz;
  // Sedimento: grão fino em duas escalas sobre as manchas largas das cores de vértice.
  float grain = snoise(vec3(p * 2.7, 0.0)) * 0.5 + 0.5;
  float fine = snoise(vec3(p * 11.0, 3.0)) * 0.5 + 0.5;
  vec3 albedo = vColor * (0.72 + 0.32 * grain + 0.12 * fine);

  // Luz fraca de cima: céu frio + um pouco de difusa pela inclinação do relevo.
  float up = clamp(vNormalW.y, 0.0, 1.0);
  vec3 color = albedo * (0.55 + 0.65 * up) + uSky * 0.03 * up;

  // Poças sob os raios de luz (mesmo falloff de shaftPool em shaftLayout.ts).
  float pool = 0.0;
  for (int i = 0; i < SHAFT_COUNT; i++) {
    vec2 d = p - uShafts[i].xy;
    pool += uShafts[i].w * exp(-dot(d, d) / (2.0 * uShafts[i].z * uShafts[i].z));
  }
  pool = min(pool, 1.0) * (0.85 + 0.3 * grain);
  color += (albedo * 1.6 + uPoolColor * 0.12) * pool * uPoolStrength;

  // Brilho da vida no chão: corais, almofadas e criaturas próximas.
  for (int i = 0; i < MAX_GLOWS; i++) {
    if (i >= uGlowCount) break;
    float f = clamp(1.0 - distance(p, uGlowPos[i].xy) / uGlowPos[i].z, 0.0, 1.0);
    color += uGlowCol[i] * f * f * uGlowPos[i].w * uGlowStrength * (0.6 + 0.4 * grain);
  }

  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}
`;

export function Seabed() {
  const geometry = useMemo(() => {
    const g = new THREE.RingGeometry(0.001, SEABED_RADIUS, 160, 90);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const dark = new THREE.Color(PALETTE.navy).lerp(new THREE.Color(PALETTE.bg), 0.4);
    const mid = new THREE.Color(PALETTE.navy).lerp(new THREE.Color(PALETTE.teal), 0.7);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, seabedHeight(x, z));
      const t = THREE.MathUtils.clamp(0.5 + fbm2D(noise, x * 0.12 + 9, z * 0.12, 3) * 0.9, 0, 1);
      tmp.copy(dark).lerp(mid, t);
      tmp.toArray(colors, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, []);

  const material = useMemo(
    () =>
      foggyShader({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uShafts: {
            value: SHAFTS.map((s) => {
              const [fx, fz] = shaftFootprint(s);
              return new THREE.Vector4(fx, fz, s.radius, s.strength / 0.06);
            }),
          },
          uPoolColor: { value: new THREE.Color('#7fb8c4') },
          uPoolStrength: { value: 0.35 },
          uGlowPos: { value: Array.from({ length: MAX_FLOOR_GLOWS }, () => new THREE.Vector4()) },
          uGlowCol: { value: Array.from({ length: MAX_FLOOR_GLOWS }, () => new THREE.Color()) },
          uGlowCount: { value: 0 },
          uGlowStrength: { value: 0.25 },
          uSky: { value: new THREE.Color('#2c6f80') },
        },
      }),
    [],
  );

  const packed = useMemo(
    () => ({ pos: new Float32Array(MAX_FLOOR_GLOWS * 4), col: new Float32Array(MAX_FLOOR_GLOWS * 3) }),
    [],
  );

  useFrame(() => {
    const n = floorGlows.pack(packed.pos, packed.col);
    const pos = material.uniforms.uGlowPos.value as THREE.Vector4[];
    const col = material.uniforms.uGlowCol.value as THREE.Color[];
    for (let i = 0; i < n; i++) {
      pos[i].fromArray(packed.pos, i * 4);
      col[i].fromArray(packed.col, i * 3);
    }
    material.uniforms.uGlowCount.value = n;
  });

  return <mesh geometry={geometry} material={material} />;
}
