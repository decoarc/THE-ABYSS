import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { useSceneSettings } from '../settings';
import { CREATURE_GLOW_RADIUS, glowOf } from '../scene/floorGlow';
import { foggyShader } from '../scene/glsl/material';
import type { Vec3 } from '../services/wire';
import { FILAMENTO as C } from './creatureConfig';
import { requestCreatureGlow } from './creatureGlow';
import { phaseOf } from './instancePhase';
import { Nucleus } from './Nucleus';
import { createTrail } from './trail';
import { useOrganismPose } from './useOrganismPose';
import { useSelectable } from './useSelectable';

const RADIAL = 8;
/** Duração do corpo em ms de trajeto: independe de quantas amostras o perfil usa. */
const BODY_MS = (C.segments - 1) * C.lag * 1000;
/** Intervalo mínimo entre amostras do rastro; com a capacidade abaixo, cobre o corpo inteiro em qualquer taxa de quadros. */
const TRAIL_STEP_MS = 8;
const TRAIL_CAPACITY = Math.ceil(BODY_MS / TRAIL_STEP_MS) + 64;
/** Salto maior que isto (resync, volta de aba) recomeça o rastro em vez de desenhar um risco. */
const TRAIL_RESET_DISTANCE = 3;
const TRAIL_GAP_MS = 500;
/** Velocidade usada para estender o corpo na primeira amostra se o servidor ainda não deu uma útil. */
const SEED_SPEED = 0.6;
const FLOOR_COLOR = glowOf(C.nucleus.color, 0, 0, 0, 0).color;

const vertex = /* glsl */ `
attribute float aU;
varying float vU;
varying vec3 vNormalV;
varying vec3 vViewDir;
#include <fog_pars_vertex>
void main() {
  vU = aU;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormalV = normalize(normalMatrix * normal);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
uniform vec3 uGlow;
uniform vec3 uBody;
uniform float uPulse;
uniform float uTime;
uniform vec3 uPulses;
varying float vU;
varying vec3 vNormalV;
varying vec3 vViewDir;
#include <fog_pars_fragment>
// travelingPulse() de pulse.ts: x = speed, y = spacing, z = width.
float travelingPulse(float u) {
  float phase = mod(u - uTime * uPulses.x, uPulses.y);
  float d = min(phase, uPulses.y - phase) / uPulses.z;
  return exp(-d * d);
}
void main() {
  // O corpo inteiro brilha (mais na cabeça) e pulsos de luz correm até a cauda.
  float body = mix(1.0, 0.3, vU);
  float pulse = travelingPulse(vU) * (1.0 - 0.6 * vU);
  float rim = pow(1.0 - abs(dot(vNormalV, vViewDir)), 1.5);
  vec3 color = uBody * (1.0 - vU) + uGlow * (body * (0.32 + 0.18 * uPulse) + pulse * 0.95 + rim * 0.3 * body);
  float alpha = clamp((0.3 + 0.45 * body + 0.35 * pulse) * (1.0 - smoothstep(0.85, 1.0, vU)), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
  #include <fog_fragment>
}
`;

/** Filamento: fita que segue a própria cabeça, ondulando, com a luz se apagando até a cauda. */
export function Filamento({ id }: { id: string }) {
  const { motion, q } = useSceneSettings();
  const pose = useOrganismPose(id);
  const selectable = useSelectable(id);
  const phase = useMemo(() => phaseOf(id), [id]);
  const offset = phase * 1000;
  const time = useRef(offset);
  const pulse = useRef(C.nucleus.pulseMin);
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const n = q.filamentoSegments;
  /** Atraso entre amostras com `n` amostras; o mesmo fator escala a fase da ondulação. */
  const lagScale = (C.segments - 1) / (n - 1);

  const { geometry, positions, normals } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(n * RADIAL * 3);
    const normals = new Float32Array(n * RADIAL * 3);
    const u = new Float32Array(n * RADIAL);
    const index: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < RADIAL; k++) u[i * RADIAL + k] = i / (n - 1);
      if (i === n - 1) continue;
      for (let k = 0; k < RADIAL; k++) {
        const a = i * RADIAL + k, b = i * RADIAL + ((k + 1) % RADIAL);
        index.push(a, a + RADIAL, b, b, a + RADIAL, b + RADIAL);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aU', new THREE.BufferAttribute(u, 1));
    g.setIndex(index);
    return { geometry: g, positions, normals };
  }, [n]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const material = useMemo(
    () =>
      foggyShader({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uGlow: { value: new THREE.Color(C.nucleus.color) },
          uBody: { value: new THREE.Color('#0b2a2e') },
          uPulse: { value: 0 },
          uTime: { value: 0 },
          uPulses: { value: new THREE.Vector3(C.pulses.speed, C.pulses.spacing, C.pulses.width) },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  const trail = useMemo(() => ({ buffer: createTrail(TRAIL_CAPACITY), lastPush: -Infinity, seeded: false }), []);

  // Vetores de trabalho reaproveitados a cada quadro.
  const scratch = useMemo(
    () => ({
      spine: Array.from({ length: n }, () => new THREE.Vector3()),
      p: [0, 0, 0] as Vec3,
      last: [0, 0, 0] as Vec3,
      dir: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      side: new THREE.Vector3(),
      up: new THREE.Vector3(),
      worldUp: new THREE.Vector3(0, 1, 0),
      offset: new THREE.Vector3(),
    }),
    [n],
  );

  useFrame((_, dt) => {
    time.current += clampDelta(dt) * motion;
    const t = time.current;
    const visible = pose.has.current;
    if (root.current) root.current.visible = visible;
    if (!visible) {
      trail.seeded = false;
      return;
    }
    const { spine, p, dir, tangent, side, up, worldUp, offset } = scratch;
    const now = performance.now();
    p[0] = pose.pos.x;
    p[1] = pose.pos.y;
    p[2] = pose.pos.z;

    // Primeira amostra (ou salto grande): estende o corpo para trás ao longo da velocidade,
    // para o Filamento não nascer encolhido num ponto.
    if (trail.seeded) {
      const last = trail.buffer.at(now, scratch.last);
      const jumped = Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) > TRAIL_RESET_DISTANCE;
      // Quadros parados por muito tempo (aba em segundo plano) deixariam o rastro vazio.
      if (jumped || now - trail.lastPush > TRAIL_GAP_MS) trail.seeded = false;
    }
    if (!trail.seeded) {
      trail.buffer = createTrail(TRAIL_CAPACITY);
      const speed = pose.vel.length();
      if (speed > 0.05) dir.copy(pose.vel).divideScalar(speed);
      else dir.set(Math.cos(phase * Math.PI * 2), 0, Math.sin(phase * Math.PI * 2));
      const v = Math.max(speed, SEED_SPEED) / 1000;
      for (let ms = BODY_MS + TRAIL_STEP_MS; ms > 0; ms -= TRAIL_STEP_MS * 4) {
        scratch.last[0] = p[0] - dir.x * v * ms;
        scratch.last[1] = p[1] - dir.y * v * ms;
        scratch.last[2] = p[2] - dir.z * v * ms;
        trail.buffer.push(now - ms, scratch.last);
      }
      trail.lastPush = -Infinity;
      trail.seeded = true;
    }
    if (now - trail.lastPush >= TRAIL_STEP_MS) {
      trail.buffer.push(now, p);
      trail.lastPush = now;
    }

    // A espinha é o próprio trajeto da cabeça amostrado no passado: o corpo passa por onde a cabeça passou.
    spine[0].copy(pose.pos);
    const lagMs = C.lag * 1000 * lagScale;
    for (let i = 1; i < n; i++) {
      trail.buffer.at(now - i * lagMs, p);
      spine[i].set(p[0], p[1], p[2]);
    }

    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      tangent.subVectors(spine[Math.max(0, i - 1)], spine[Math.min(n - 1, i + 1)]).normalize();
      side.crossVectors(tangent, worldUp).normalize();
      up.crossVectors(side, tangent).normalize();
      // Ondulação lateral que viaja da cabeça para a cauda, crescendo com a distância da cabeça.
      const wave = Math.sin(t * 1.6 - i * 0.18 * lagScale) * C.undulation * Math.min(1, s * 3);
      offset.copy(side).multiplyScalar(wave);
      const radius = C.width * (1 - s) ** 0.7 + 0.004;
      for (let k = 0; k < RADIAL; k++) {
        const a = (k / RADIAL) * Math.PI * 2;
        const cx = Math.cos(a), cy = Math.sin(a);
        const o = (i * RADIAL + k) * 3;
        // Seção elíptica: larga no eixo lateral, fina no vertical → fita.
        const nx = side.x * cx + up.x * cy, ny = side.y * cx + up.y * cy, nz = side.z * cx + up.z * cy;
        positions[o] = spine[i].x + offset.x + (side.x * cx + up.x * cy * C.flatness) * radius;
        positions[o + 1] = spine[i].y + offset.y + (side.y * cx + up.y * cy * C.flatness) * radius;
        positions[o + 2] = spine[i].z + offset.z + (side.z * cx + up.z * cy * C.flatness) * radius;
        normals[o] = nx;
        normals[o + 1] = ny;
        normals[o + 2] = nz;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;

    const range = C.nucleus.pulseMax - C.nucleus.pulseMin;
    material.uniforms.uPulse.value = (pulse.current - C.nucleus.pulseMin) / range;
    material.uniforms.uTime.value = t;
    head.current?.position.copy(spine[0]);
    requestCreatureGlow(id, FLOOR_COLOR, spine[0].x, spine[0].y, spine[0].z, CREATURE_GLOW_RADIUS, 0.7);
  });

  return (
    <group ref={root} visible={false} {...selectable}>
      <mesh geometry={geometry} material={material} renderOrder={3} frustumCulled={false} />
      <group ref={head}>
        <Nucleus config={C.nucleus} pulseRef={pulse} haloScale={9} timeOffset={offset} />
      </group>
    </group>
  );
}
