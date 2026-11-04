import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm2D } from '../lib/noise';
import { PALETTE } from '../lib/palette';
import { useSceneSettings } from '../settings';
import { CULL_DISTANCE } from './cull';
import { SHAFTS, shaftFootprint } from './environment/shaftLayout';
import { MAX_FLOOR_GLOWS, MAX_FOOD_LIGHTS, floorGlows, foodLights } from './floorGlow';
import { foggyShader } from './glsl/material';
import { SNOISE } from './glsl/noise';
import { planicieWeight, regionTint } from './regionTint';
import { TILE_SIZE, seabedTiles, type SeabedTile } from './seabedTiles';
import { seabedHeight, terrainNoise as noise } from './terrain';

const vertex = /* glsl */ `
attribute vec3 color;
attribute float aPlain;
varying vec3 vColor;
varying float vPlain;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <fog_pars_vertex>
void main() {
  vColor = color;
  vPlain = aPlain;
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
#define MAX_FOOD ${MAX_FOOD_LIGHTS}
uniform vec4 uShafts[SHAFT_COUNT];
uniform vec3 uPoolColor;
uniform float uPoolStrength;
uniform vec4 uGlowPos[MAX_GLOWS];
uniform vec3 uGlowCol[MAX_GLOWS];
uniform int uGlowCount;
uniform float uGlowStrength;
uniform vec3 uSky;
uniform vec4 uFoodPos[MAX_FOOD];
uniform vec3 uFoodCol[MAX_FOOD];
uniform int uFoodCount;
uniform float uFoodStrength;
uniform float uPlainBase;
uniform vec2 uDuneLight;
uniform float uDuneShade;
varying vec3 vColor;
varying float vPlain;
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

  // Planície: a luz de cima cai e as dunas aparecem por uma luz rasante fraca, de lado.
  float dune = 1.0 + uDuneShade * dot(vNormalW.xz, uDuneLight);
  color *= mix(1.0, uPlainBase * max(dune, 0.2), vPlain);

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

  // Planície: quem acende o chão é a comida pousada nele.
  if (vPlain > 0.001) {
    vec3 food = vec3(0.0);
    for (int i = 0; i < MAX_FOOD; i++) {
      if (i >= uFoodCount) break;
      float f = clamp(1.0 - distance(p, uFoodPos[i].xy) / uFoodPos[i].z, 0.0, 1.0);
      food += uFoodCol[i] * f * f * uFoodPos[i].w;
    }
    color += (albedo * 2.5 + 0.35) * food * uFoodStrength * vPlain * (0.7 + 0.3 * grain);
  }

  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}
`;

/** Sedimento da Planície (vértices): mais claro que o do Jardim, quase sem manchas. */
const PLAIN_SEDIMENT_DARK = '#16323a';
const PLAIN_SEDIMENT = '#2c5258';

/** Um bloco do leito em coordenadas de mundo; normais por diferença central sobre a mesma grade, então os blocos vizinhos casam na emenda. */
function tileGeometry(tile: SeabedTile, segments: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(tile.size, tile.size, segments, segments);
  g.rotateX(-Math.PI / 2);
  g.translate(tile.cx, 0, tile.cz);
  const step = tile.size / segments;
  const x0 = tile.cx - tile.size / 2;
  const z0 = tile.cz - tile.size / 2;
  // Alturas com uma volta extra de amostras em cada lado, para as normais da borda.
  const side = segments + 3;
  const heights = new Float64Array(side * side);
  for (let k = 0; k < side; k++)
    for (let i = 0; i < side; i++) heights[k * side + i] = seabedHeight(x0 + (i - 1) * step, z0 + (k - 1) * step);
  const h = (i: number, k: number) => heights[(k + 1) * side + (i + 1)];

  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const dark = new THREE.Color(PALETTE.navy).lerp(new THREE.Color(PALETTE.bg), 0.4);
  const mid = new THREE.Color(PALETTE.navy).lerp(new THREE.Color(PALETTE.teal), 0.7);
  // Planície: sedimento claro e mais uniforme, aberto.
  const plainDark = new THREE.Color(PLAIN_SEDIMENT_DARK);
  const plainMid = new THREE.Color(PLAIN_SEDIMENT);
  const plainTmp = new THREE.Color();
  const plain = new Float32Array(pos.count);
  const tmp = new THREE.Color();
  const n = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    const x = pos.getX(v), z = pos.getZ(v);
    const i = Math.round((x - x0) / step), k = Math.round((z - z0) / step);
    pos.setY(v, h(i, k));
    n.set(h(i - 1, k) - h(i + 1, k), 2 * step, h(i, k - 1) - h(i, k + 1)).normalize();
    nor.setXYZ(v, n.x, n.y, n.z);
    const t = THREE.MathUtils.clamp(0.5 + fbm2D(noise, x * 0.12 + 9, z * 0.12, 3) * 0.9, 0, 1);
    tmp.copy(dark).lerp(mid, t);
    const w = planicieWeight(x, z);
    if (w > 0) tmp.lerp(plainTmp.copy(plainDark).lerp(plainMid, 0.55 + (t - 0.5) * 0.5), w);
    plain[v] = w;
    tmp.toArray(colors, v * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aPlain', new THREE.BufferAttribute(plain, 1));
  g.computeBoundingSphere();
  return g;
}

/** Distância (horizontal) do centro de um bloco além da qual nem o canto mais próximo fica a menos de `CULL_DISTANCE`. */
const TILE_HIDE = CULL_DISTANCE + TILE_SIZE * Math.SQRT1_2;

export function Seabed() {
  const { q } = useSceneSettings();
  const camera = useThree((s) => s.camera);
  const tiles = useMemo(() => seabedTiles(), []);
  const geometries = useMemo(() => tiles.map((t) => tileGeometry(t, q.seabedSegments)), [tiles, q.seabedSegments]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);

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
          uPoolStrength: { value: 0.45 },
          uGlowPos: { value: Array.from({ length: MAX_FLOOR_GLOWS }, () => new THREE.Vector4()) },
          uGlowCol: { value: Array.from({ length: MAX_FLOOR_GLOWS }, () => new THREE.Color()) },
          uGlowCount: { value: 0 },
          uGlowStrength: { value: 0.25 },
          uSky: { value: new THREE.Color('#2c6f80') },
          uFoodPos: { value: foodLights.pos },
          uFoodCol: { value: foodLights.col },
          uFoodCount: { value: 0 },
          uFoodStrength: { value: 1.3 },
          uPlainBase: { value: 0.3 },
          uDuneLight: { value: new THREE.Vector2(0.6, 0.8) },
          uDuneShade: { value: 5 },
        },
      }),
    [],
  );

  const tint = useMemo(() => regionTint(0, 0), []);
  const packed = useMemo(
    () => ({ pos: new Float32Array(MAX_FLOOR_GLOWS * 4), col: new Float32Array(MAX_FLOOR_GLOWS * 3) }),
    [],
  );

  useFrame(() => {
    // Blocos inteiros além da névoa não são desenhados.
    tiles.forEach((t, i) => {
      const m = meshes.current[i];
      if (m) m.visible = Math.hypot(t.cx - camera.position.x, t.cz - camera.position.z) <= TILE_HIDE;
    });
    const n = floorGlows.pack(packed.pos, packed.col);
    const pos = material.uniforms.uGlowPos.value as THREE.Vector4[];
    const col = material.uniforms.uGlowCol.value as THREE.Color[];
    for (let i = 0; i < n; i++) {
      pos[i].fromArray(packed.pos, i * 4);
      col[i].fromArray(packed.col, i * 3);
    }
    material.uniforms.uGlowCount.value = n;
    material.uniforms.uFoodCount.value = foodLights.count;
    regionTint(camera.position.x, camera.position.z, tint);
    (material.uniforms.uSky.value as THREE.Color).copy(tint.sky);
  });

  return (
    <>
      {geometries.map((g, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={g}
          material={material}
        />
      ))}
    </>
  );
}
