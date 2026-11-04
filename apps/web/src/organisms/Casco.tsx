import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { createRng } from '../lib/random';
import { CREATURE_GLOW_RADIUS, glowOf } from '../scene/floorGlow';
import { useSceneSettings } from '../settings';
import { useCreatureCull } from '../scene/cull';
import { useWorld } from '../services/WorldProvider';
import { CASCO as C } from './creatureConfig';
import { requestCreatureGlow } from './creatureGlow';
import { requestCreatureLight } from './creatureLights';
import { phaseOf } from './instancePhase';
import { Nucleus } from './Nucleus';
import { useOrganismPose } from './useOrganismPose';
import { useSelectable } from './useSelectable';

const FLOOR_COLOR = glowOf(C.nucleus.color, 0, 0, 0, 0).color;

/** Espessura das placas, relativa ao raio. */
const PLATE_DEPTH = 0.22;

/**
 * Dodecaedro de vértices perturbados, cada face uma placa grossa separada,
 * encolhida em direção ao próprio centro: as frestas deixam a luz de dentro vazar.
 */
function shellGeometry(): THREE.BufferGeometry {
  const rng = createRng(1203);
  const src = new THREE.DodecahedronGeometry(1, 0);
  const pos = src.attributes.position as THREE.BufferAttribute;

  // Perturba cada vértice único (mesma posição → mesmo deslocamento) para as faces continuarem casando.
  const jitter = new Map<string, THREE.Vector3>();
  const key = (v: THREE.Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const k = key(v);
    if (!jitter.has(k)) jitter.set(k, v.clone().multiplyScalar(0.85 + rng() * 0.3));
    verts.push(jitter.get(k)!.clone());
  }

  // Agrupa triângulos pela normal original: 3 triângulos por face pentagonal.
  const faces = new Map<string, THREE.Vector3[]>();
  const n = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    const k = key(n.multiplyScalar(10).round());
    if (!faces.has(k)) faces.set(k, []);
    faces.get(k)!.push(verts[i], verts[i + 1], verts[i + 2]);
  }

  const out: number[] = [];
  const push = (...vs: THREE.Vector3[]) => vs.forEach((v) => out.push(v.x, v.y, v.z));
  for (const tris of faces.values()) {
    const centroid = new THREE.Vector3();
    tris.forEach((v) => centroid.add(v));
    centroid.divideScalar(tris.length);
    const lift = 1 + rng() * 0.06;
    const outer = tris.map((v) => v.clone().sub(centroid).multiplyScalar(C.faceShrink).add(centroid).multiplyScalar(lift));
    const inner = outer.map((v) => v.clone().multiplyScalar(1 - PLATE_DEPTH));
    for (let i = 0; i < outer.length; i += 3) {
      push(outer[i], outer[i + 1], outer[i + 2]);
      push(inner[i], inner[i + 2], inner[i + 1]);
      // Paredes laterais, só nas arestas do contorno (as diagonais internas se cancelam visualmente).
      for (let e = 0; e < 3; e++) {
        const o0 = outer[i + e], o1 = outer[i + ((e + 1) % 3)];
        const i0 = inner[i + e], i1 = inner[i + ((e + 1) % 3)];
        push(o0, i0, o1, o1, i0, i1);
      }
    }
  }
  src.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  g.scale(C.radius, C.radius, C.radius);
  return g;
}

// Compartilhada por todas as instâncias.
let sharedGeometry: THREE.BufferGeometry | null = null;
const getGeometry = () => (sharedGeometry ??= shellGeometry());

/** Casco: rígido, facetado, quase imóvel; gira devagar e às vezes dá um tranco curto. */
export function Casco({ id }: { id: string }) {
  const { motion } = useSceneSettings();
  const pose = useOrganismPose(id);
  const selectable = useSelectable(id);
  const geometry = getGeometry();
  const group = useRef<THREE.Group>(null);
  const shown = useCreatureCull(group, pose);
  const scale = useWorld().store.creatureScale();
  const pulse = useRef(C.nucleus.pulseMin);
  const phase = useMemo(() => phaseOf(id), [id]);
  const state = useMemo(() => {
    // Semente por instância: os trancos de cascos diferentes não coincidem.
    const rng = createRng(77 + Math.floor(phase * 2 ** 31));
    const t = phase * 1000;
    return {
      rng,
      t,
      nextAdjust: t + C.adjustEvery[0] * (0.5 + rng()),
      adjustT: -1,
      adjustAxis: new THREE.Vector3(1, 0, 0),
      jolt: new THREE.Vector3(),
      drift: new THREE.Vector3(),
      axis: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      // Orientação inicial diferente para cada instância.
      initial: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 6.28, rng() * 6.28, rng() * 6.28)),
    };
  }, [phase]);
  const glowColor = useMemo(() => new THREE.Color(C.nucleus.color), []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (!shown.current) return;
    const s = state;
    const step = clampDelta(dt) * motion;
    s.t += step;

    // Rotação lenta em torno de um eixo que vagueia.
    s.axis.set(Math.sin(s.t * 0.05), Math.cos(s.t * 0.037), Math.sin(s.t * 0.029 + 1)).normalize();
    s.q.setFromAxisAngle(s.axis, 0.11 * step);
    g.quaternion.premultiply(s.q);

    // Ajuste brusco: impulso curto de rotação e um pequeno deslocamento, com saída suave.
    if (s.adjustT < 0 && s.t >= s.nextAdjust) {
      s.adjustT = 0;
      s.adjustAxis.set(s.rng() - 0.5, s.rng() - 0.5, s.rng() - 0.5).normalize();
      s.jolt.set(s.rng() - 0.5, (s.rng() - 0.5) * 0.5, s.rng() - 0.5).multiplyScalar(0.35);
      const [lo, hi] = C.adjustEvery;
      s.nextAdjust = s.t + lo + s.rng() * (hi - lo);
    }
    if (s.adjustT >= 0) {
      s.adjustT += step;
      const k = Math.max(0, 1 - s.adjustT / C.adjustDuration);
      s.q.setFromAxisAngle(s.adjustAxis, 2.4 * k * k * step);
      g.quaternion.premultiply(s.q);
      s.drift.addScaledVector(s.jolt, k * k * step * 3);
      if (k === 0) s.adjustT = -1;
    }
    // Volta devagar ao ponto de pairar.
    s.drift.multiplyScalar(1 - Math.min(1, step * 0.25));

    // Posição canônica do servidor + deriva cosmética dos trancos e leve flutuação, no tamanho da criatura.
    g.position.set(
      pose.pos.x + s.drift.x * scale,
      pose.pos.y + (s.drift.y + Math.sin(s.t * 0.4) * 0.08) * scale,
      pose.pos.z + s.drift.z * scale,
    );
    requestCreatureLight(glowColor, g.position.x, g.position.y, g.position.z, 1.2 * pulse.current);
    requestCreatureGlow(id, FLOOR_COLOR, g.position.x, g.position.y, g.position.z, CREATURE_GLOW_RADIUS, 0.35 * pulse.current);
  });

  return (
    <group ref={group} visible={false} scale={scale} {...selectable} quaternion={state.initial}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#10161c" roughness={0.85} metalness={0.05} flatShading />
      </mesh>
      <Nucleus config={C.nucleus} pulseRef={pulse} haloScale={4} timeOffset={phase * 1000} />
    </group>
  );
}
