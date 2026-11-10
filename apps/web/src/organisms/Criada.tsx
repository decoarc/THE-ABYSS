import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { previewTraits } from '../genesis/blueprint';
import { geometryCache, spineAxis, type CreatureGeometry } from '../genesis/geometry';
import { applyBlueprint, createBodyMaterial, createPartsMaterial } from '../genesis/materials';
import { clampDelta } from '../lib/motion';
import { CREATURE_GLOW_RADIUS, glowOf } from '../scene/floorGlow';
import { useCreatureCull } from '../scene/cull';
import { useSceneSettings } from '../settings';
import { useWorld } from '../services/WorldProvider';
import type { Blueprint } from '../services/wire';
import type { NucleusConfig } from './creatureConfig';
import { requestCreatureGlow } from './creatureGlow';
import { phaseOf } from './instancePhase';
import { Nucleus } from './Nucleus';
import { useOrganismPose } from './useOrganismPose';
import { useSelectable } from './useSelectable';
import { useVitals } from './useVitals';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
/** Abaixo desta velocidade (unidades/s) a direção é ruído: a criatura mantém a orientação. */
const MIN_HEADING_SPEED = 0.02;
/** Rapidez com que a frente vira para a velocidade (1/s), como a Célula. */
const TURN_RATE = 1.5;
const PULSE_MIN = 1.4;
const PULSE_MAX = 2.6;

/** Cor do núcleo: a `glow` da planta, clareada se for escura demais para passar do limiar do bloom. */
function nucleusColor(hex: string): string {
  const c = new THREE.Color(hex);
  const m = Math.max(c.r, c.g, c.b);
  if (m <= 0.001) return '#7fe9dd';
  if (m < 0.6) c.multiplyScalar(0.6 / m);
  return `#${c.getHexString()}`;
}

interface Aim {
  heading: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  basis: THREE.Matrix4;
  orient: THREE.Quaternion;
  target: THREE.Quaternion;
  aimed: boolean;
}

/** Frente (+y local) na direção, topo (+z local) o mais perto possível do "cima" do mundo. */
function aim(s: Aim, heading: THREE.Vector3, out: THREE.Quaternion): boolean {
  s.up.copy(WORLD_UP).addScaledVector(heading, -heading.dot(WORLD_UP));
  const l = s.up.length();
  if (l < 0.15) return false; // quase vertical: mantém
  s.up.divideScalar(l);
  s.right.crossVectors(heading, s.up);
  s.basis.makeBasis(s.right, heading, s.up);
  out.setFromRotationMatrix(s.basis);
  return true;
}

/** Espécie criada: desenhada da sua planta, com o mesmo programa de shader para toda planta. */
export function Criada({ id }: { id: string }) {
  const { store } = useWorld();
  // Planta e espécie de um organismo não mudam: basta ler uma vez.
  const bp = useMemo(() => {
    const org = store.roster().find((o) => o.id === id);
    return store.species().find((s) => s.id === org?.species)?.blueprint ?? null;
  }, [store, id]);
  return bp ? <CriadaBody id={id} bp={bp} /> : null;
}

function CriadaBody({ id, bp }: { id: string; bp: Blueprint }) {
  const { motion } = useSceneSettings();
  const pose = useOrganismPose(id);
  const vitals = useVitals(id);
  const selectable = useSelectable(id);
  const group = useRef<THREE.Group>(null);
  const shown = useCreatureCull(group, pose);
  const scale = useWorld().store.creatureScale();
  const pulse = useRef(PULSE_MIN);
  const phase = useMemo(() => phaseOf(id), [id]);
  const offset = phase * 1000;
  const time = useRef(offset);

  // Geometria compartilhada por planta; pega no efeito (não no render) para o StrictMode não vazar.
  const [geometry, setGeometry] = useState<CreatureGeometry | null>(null);
  useLayoutEffect(() => {
    setGeometry(geometryCache.acquire(bp));
    return () => geometryCache.release(bp);
  }, [bp]);

  const look = useMemo(() => {
    const color = nucleusColor(bp.colors.glow);
    // Núcleo no ponto do eixo mais perto do centróide da espinha (sempre dentro do corpo).
    const pts = bp.body.spine;
    const cx = pts.reduce((m, p) => m + p[0], 0) / pts.length;
    const cy = pts.reduce((m, p) => m + p[1], 0) / pts.length;
    let best = { center: new THREE.Vector3(0, cx, cy), radius: pts[0][2] };
    let bestD = Infinity;
    for (let k = 0; k <= 64; k++) {
      const a = spineAxis(bp, k / 64);
      const d = (a.center.y - cx) ** 2 + (a.center.z - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    const nucleus: NucleusConfig = {
      color,
      radius: Math.min(Math.max(best.radius * 0.33, 0.09), 0.24),
      pulseHz: 0.22,
      pulseMin: PULSE_MIN,
      pulseMax: PULSE_MAX,
    };
    return {
      nucleus,
      nucleusAt: best.center.toArray() as [number, number, number],
      glow: new THREE.Color(bp.colors.glow),
      floor: glowOf(color, 0, 0, 0, 0).color,
      maxSpeed: previewTraits(bp).max_speed,
      hasParts: bp.parts.length > 0,
    };
  }, [bp]);

  const materials = useMemo(() => {
    const body = createBodyMaterial();
    const parts = createPartsMaterial();
    applyBlueprint(body, bp);
    applyBlueprint(parts, bp);
    return { body, parts };
  }, [bp]);
  useEffect(
    () => () => {
      materials.body.dispose();
      materials.parts.dispose();
    },
    [materials],
  );

  const scratch = useMemo(() => {
    // Antes da primeira velocidade útil, numa direção horizontal própria da instância.
    const a = phase * Math.PI * 2;
    const s: Aim = {
      heading: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      basis: new THREE.Matrix4(),
      orient: new THREE.Quaternion(),
      target: new THREE.Quaternion(),
      aimed: false,
    };
    aim(s, s.heading, s.orient);
    return s;
  }, [phase]);

  useFrame((_, dt) => {
    time.current += clampDelta(dt) * motion;
    const g = group.current;
    if (!g || !shown.current) return;
    g.position.copy(pose.pos);
    const speed = pose.vel.length();
    if (speed > MIN_HEADING_SPEED) {
      scratch.heading.copy(pose.vel).divideScalar(speed);
      if (aim(scratch, scratch.heading, scratch.target)) {
        if (scratch.aimed) scratch.orient.slerp(scratch.target, 1 - Math.exp(-TURN_RATE * clampDelta(dt)));
        else scratch.orient.copy(scratch.target);
        scratch.aimed = true;
      }
    }
    g.quaternion.copy(scratch.orient);

    const breath = (pulse.current - PULSE_MIN) / (PULSE_MAX - PULSE_MIN);
    const fade = vitals.fade.current;
    const glow = vitals.glow.current;
    const bu = materials.body.uniforms;
    bu.uPulse.value = breath;
    bu.uFade.value = fade;
    (bu.uGlow.value as THREE.Color).copy(look.glow).multiplyScalar(glow);
    const pu = materials.parts.uniforms;
    pu.uTime.value = time.current;
    pu.uSwim.value = look.maxSpeed > 0 ? Math.min(speed / look.maxSpeed, 1) : 0;
    pu.uFade.value = fade;
    (pu.uGlow.value as THREE.Color).copy(look.glow).multiplyScalar(glow * (0.8 + 0.4 * breath));

    // Eixo longo (+y local, virado para a velocidade) estica; os outros dois encolhem em 1/sqrt.
    const life = scale * vitals.scale.current;
    const st = vitals.stretch.current;
    const k = 1 / Math.sqrt(st);
    g.scale.set(life * k, life * st, life * k);
    requestCreatureGlow(id, look.floor, g.position.x, g.position.y, g.position.z, CREATURE_GLOW_RADIUS, (0.5 + 0.3 * breath) * glow * fade);
  });

  return (
    <group ref={group} visible={false} {...selectable}>
      {geometry && (
        <>
          {/* Núcleo e peças primeiro; a pele translúcida é desenhada por cima. */}
          <group position={look.nucleusAt}>
            <Nucleus config={look.nucleus} pulseRef={pulse} glowRef={vitals.glow} fadeRef={vitals.fade} haloScale={4} timeOffset={offset} />
          </group>
          {look.hasParts && <mesh geometry={geometry.parts} material={materials.parts} renderOrder={1} />}
          <mesh geometry={geometry.body} material={materials.body} renderOrder={2} />
        </>
      )}
    </group>
  );
}
