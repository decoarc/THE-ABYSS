import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clampDelta } from '../lib/motion';
import { createNoise2D } from '../lib/noise';
import { PALETTE } from '../lib/palette';
import { createRng } from '../lib/random';
import { useWorld } from '../services/WorldProvider';
import { useSceneSettings } from '../settings';
import { isCulled } from '../scene/cull';
import { foggyShader } from '../scene/glsl/material';
import { seabedHeight } from '../scene/terrain';
import { floraLook, hash01, type FloraLook } from './floraLook';

/** Teto de manchas desenhadas, igual em todos os perfis. */
export const MAX_FLORA_PATCHES = 200;
/** Duração da troca de nível: a mordida encolhe a mancha à vista. */
const TRANSITION_S = 0.5;
/** Raio do tapete na escala 1. */
const MAT_RADIUS = 0.45;

/**
 * Uma mancha: tapete baixo de borda luminosa (como as almofadas) com hastes curtas e bulbos
 * gordos (como os tufos, mais cheios), para ler como algo que se come.
 * `aKind`: 0 tapete, 1 haste ou bulbo. `aTip`: no tapete, a distância ao centro (0 a 1);
 * na haste, de 0 (base) a 0,6; 1 no bulbo.
 */
function patchGeometry(stalks: number, matSides: number): THREE.BufferGeometry {
  const rng = createRng(919);
  const noise = createNoise2D(920);
  const parts: THREE.BufferGeometry[] = [];

  const mat = new THREE.SphereGeometry(MAT_RADIUS, matSides, Math.max(3, Math.round(matSides / 3)), 0, Math.PI * 2, 0, Math.PI / 2);
  const mp = mat.attributes.position as THREE.BufferAttribute;
  const matTip = new Float32Array(mp.count);
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + 0.22 * noise(Math.cos(a) * 1.4 + 7, Math.sin(a) * 1.4);
    mp.setXYZ(i, x * k, y * 0.14, z * k);
    matTip[i] = Math.hypot(x, z) / MAT_RADIUS;
  }
  mat.setAttribute('aTip', new THREE.BufferAttribute(matTip, 1));
  mat.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(mp.count), 1));
  parts.push(mat);

  for (let i = 0; i < stalks; i++) {
    // Espiral de ângulo áureo: as hastes cobrem o tapete sem se amontoar no centro.
    const r = MAT_RADIUS * 0.75 * Math.sqrt((i + 0.5) / stalks);
    const a = i * 2.39996;
    const h = 0.16 + rng() * 0.2;
    const stalk = new THREE.CylinderGeometry(0.008, 0.016, h, 4, 2, true);
    stalk.translate(0, h / 2, 0);
    const bulb = new THREE.IcosahedronGeometry(0.038 + rng() * 0.02, 1);
    bulb.translate(0, h, 0);
    const leanX = (rng() - 0.5) * 0.6, leanZ = (rng() - 0.5) * 0.6;
    for (const [g, isBulb] of [[stalk, false], [bulb, true]] as const) {
      g.rotateX(leanX);
      g.rotateZ(leanZ);
      g.translate(Math.cos(a) * r, 0.02, Math.sin(a) * r);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const tip = new Float32Array(pos.count);
      for (let k = 0; k < pos.count; k++) tip[k] = isBulb ? 1 : Math.min(0.6, Math.max(0, (pos.getY(k) / h) * 0.6));
      g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
      g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(pos.count).fill(1), 1));
      parts.push(g);
    }
  }
  const merged = mergeGeometries(parts.map((g) => {
    g.deleteAttribute('uv');
    return g.index ? g.toNonIndexed() : g;
  }));
  merged.computeVertexNormals();
  return merged;
}

const vertex = /* glsl */ `
attribute float aTip;
attribute float aKind;
attribute float aPhase;
attribute float aGlow;
attribute vec3 aColor;
uniform float uTime;
varying float vTip;
varying float vKind;
varying float vGlow;
varying float vPhase;
varying vec3 vColor;
varying vec3 vNormalV;
varying vec3 vViewDir;
#include <fog_pars_vertex>
void main() {
  vTip = aTip;
  vKind = aKind;
  vGlow = aGlow;
  vPhase = aPhase;
  vColor = aColor;
  vec3 p = position;
  float bend = aKind * aTip * aTip;
  p.x += sin(uTime * 0.8 + aPhase * 6.2831) * 0.035 * bend;
  p.z += cos(uTime * 0.6 + aPhase * 4.0) * 0.025 * bend;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  vNormalV = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform float uTime;
uniform vec3 uStalk;
varying float vTip;
varying float vKind;
varying float vGlow;
varying float vPhase;
varying vec3 vColor;
varying vec3 vNormalV;
varying vec3 vViewDir;
#include <fog_pars_fragment>
void main() {
  float pulse = 0.7 + 0.3 * sin(uTime * 0.7 + vPhase * 6.2831);
  float facing = abs(dot(normalize(vNormalV), normalize(vViewDir)));
  // Tapete: centro escuro, só a borda acende (como as almofadas); não pode ler como disco de plástico.
  float edge = smoothstep(0.7, 1.0, vTip);
  vec3 mat = vColor * (0.025 + 0.04 * vGlow + edge * edge * (0.12 + 0.3 * vGlow) * pulse + (1.0 - facing) * 0.08 * vGlow);
  // Haste escura tingida perto da ponta; bulbo aceso e redondo, mais forte quanto mais crescida a mancha.
  float bulb = step(0.99, vTip);
  float twinkle = 0.75 + 0.25 * sin(uTime * 1.1 + vPhase * 37.0);
  vec3 stalk = uStalk + vColor * vTip * (0.1 + 0.15 * vGlow);
  vec3 tipColor = vColor * (0.5 + 1.4 * vGlow) * twinkle * (0.45 + 0.55 * facing);
  vec3 color = mix(mat, mix(stalk, tipColor, bulb), vKind);
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}
`;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Manchas de flora canônicas num único InstancedMesh, sempre montado, com material único.
 * Escala e brilho vêm do nível (`floraLook`), com transição de 0,5 s; manchas além de
 * CULL_DISTANCE não são atualizadas até a câmera chegar perto.
 */
export function FloraPatches() {
  const { store } = useWorld();
  const { q, motion } = useSceneSettings();
  const camera = useThree((s) => s.camera);
  const mesh = useRef<THREE.InstancedMesh>(null);

  const glowAttr = useMemo(() => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLORA_PATCHES), 1);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  }, []);
  const geometry = useMemo(() => {
    const g = patchGeometry(q.floraStalks, q.floraMatSides);
    const phase = new Float32Array(MAX_FLORA_PATCHES);
    const color = new Float32Array(MAX_FLORA_PATCHES * 3);
    const cyan = new THREE.Color(PALETTE.cyan);
    const violet = new THREE.Color(PALETTE.violet);
    const c = new THREE.Color();
    for (let i = 0; i < MAX_FLORA_PATCHES; i++) {
      phase[i] = hash01(i, 1);
      // Ciano, às vezes puxando para violeta: a família das almofadas e dos tufos.
      c.copy(cyan).lerp(violet, hash01(i, 2) < 0.75 ? hash01(i, 3) * 0.2 : 0.25 + hash01(i, 3) * 0.2);
      c.toArray(color, i * 3);
    }
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(color, 3));
    g.setAttribute('aGlow', glowAttr);
    return g;
  }, [q.floraStalks, q.floraMatSides, glowAttr]);
  const material = useMemo(
    () =>
      foggyShader({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uTime: { value: 0 }, uStalk: { value: new THREE.Color('#0b1f24') } },
      }),
    [],
  );

  // Estado por mancha, alocado uma vez.
  const s = useMemo(
    () => ({
      source: null as Float32Array | null,
      version: -1,
      n: 0,
      /** x, y (leito), z, tamanho, giro. */
      base: new Float32Array(MAX_FLORA_PATCHES * 5),
      from: new Float32Array(MAX_FLORA_PATCHES),
      to: new Float32Array(MAX_FLORA_PATCHES),
      start: new Float32Array(MAX_FLORA_PATCHES),
      /** Nível escrito na matriz; NaN = ainda não escrito. */
      drawn: new Float32Array(MAX_FLORA_PATCHES).fill(NaN),
      dirty: false,
      time: 0,
      look: { scale: 0, glow: 0 } as FloraLook,
      matrix: new THREE.Matrix4(),
      quat: new THREE.Quaternion(),
      pos: new THREE.Vector3(),
      scale: new THREE.Vector3(),
      point: { x: 0, y: 0, z: 0 },
    }),
    [],
  );

  // Todas as instâncias começam escondidas (escala 0), mas sempre desenhadas: o programa compila na montagem.
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < MAX_FLORA_PATCHES; i++) m.setMatrixAt(i, ZERO);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceMatrix.needsUpdate = true;
    s.source = null;
    s.version = -1;
    s.drawn.fill(NaN);
  }, [geometry, s]);

  useFrame((_, dt) => {
    s.time += clampDelta(dt);
    material.uniforms.uTime.value += clampDelta(dt) * motion;
    const m = mesh.current;
    if (!m) return;
    const now = s.time;
    const food = store.food();
    const version = food.floraVersion();

    if (version !== s.version) {
      s.version = version;
      s.dirty = true;
      const flora = food.flora();
      if (flora !== s.source) {
        // Snapshot novo: a mancha aparece no nível atual, sem transição.
        s.source = flora;
        const n = Math.min(MAX_FLORA_PATCHES, Math.floor(flora.length / 3));
        for (let i = 0; i < n; i++) {
          const x = flora[i * 3], z = flora[i * 3 + 1];
          s.base[i * 5] = x;
          s.base[i * 5 + 1] = seabedHeight(x, z) - 0.02;
          s.base[i * 5 + 2] = z;
          s.base[i * 5 + 3] = 0.85 + hash01(i, 4) * 0.3;
          s.base[i * 5 + 4] = hash01(i, 5) * Math.PI * 2;
          s.from[i] = s.to[i] = flora[i * 3 + 2];
          s.start[i] = -Infinity;
          s.drawn[i] = NaN;
        }
        for (let i = n; i < s.n; i++) m.setMatrixAt(i, ZERO);
        if (n < s.n) m.instanceMatrix.needsUpdate = true;
        s.n = n;
      } else {
        for (let i = 0; i < s.n; i++) {
          const level = flora[i * 3 + 2];
          if (level === s.to[i]) continue;
          s.from[i] = shownLevel(s, i, now);
          s.to[i] = level;
          s.start[i] = now;
        }
      }
    }
    if (!s.dirty) return;

    let pending = false;
    let wrote = false;
    for (let i = 0; i < s.n; i++) {
      const moving = now - s.start[i] < TRANSITION_S;
      const level = shownLevel(s, i, now);
      if (!moving && level === s.drawn[i]) continue;
      s.point.x = s.base[i * 5];
      s.point.y = s.base[i * 5 + 1];
      s.point.z = s.base[i * 5 + 2];
      if (isCulled(camera.position, s.point)) {
        // Longe demais: fica como está até a câmera chegar perto.
        pending = true;
        continue;
      }
      floraLook(level, s.look);
      const size = s.look.scale * s.base[i * 5 + 3];
      s.pos.set(s.point.x, s.point.y, s.point.z);
      s.quat.setFromAxisAngle(UP, s.base[i * 5 + 4]);
      s.scale.set(size, size, size);
      m.setMatrixAt(i, s.matrix.compose(s.pos, s.quat, s.scale));
      glowAttr.setX(i, s.look.glow);
      s.drawn[i] = level;
      wrote = true;
      if (moving) pending = true;
    }
    if (wrote) {
      m.instanceMatrix.needsUpdate = true;
      glowAttr.needsUpdate = true;
    }
    s.dirty = pending;
  });

  return (
    <instancedMesh
      key={geometry.uuid}
      ref={mesh}
      args={[geometry, material, MAX_FLORA_PATCHES]}
      frustumCulled={false}
    />
  );
}

/** Nível mostrado agora: do anterior ao novo em TRANSITION_S, com suavização nas pontas. */
function shownLevel(s: { from: Float32Array; to: Float32Array; start: Float32Array }, i: number, now: number): number {
  const t = (now - s.start[i]) / TRANSITION_S;
  if (t >= 1) return s.to[i];
  const k = t <= 0 ? 0 : t * t * (3 - 2 * t);
  return s.from[i] + (s.to[i] - s.from[i]) * k;
}
