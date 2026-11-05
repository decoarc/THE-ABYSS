import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { CREATURE_GLOW_RADIUS, glowOf } from '../scene/floorGlow';
import { useSceneSettings } from '../settings';
import { useCreatureCull } from '../scene/cull';
import { useWorld } from '../services/WorldProvider';
import { POLIEDRO as C } from './creatureConfig';
import { requestCreatureGlow } from './creatureGlow';
import { phaseOf } from './instancePhase';
import { Nucleus } from './Nucleus';
import { useOrganismPose } from './useOrganismPose';
import { useStretchFrame, useVitals } from './useVitals';
import { useSelectable } from './useSelectable';

const FLOOR_COLOR = glowOf(C.nucleus.color, 0, 0, 0, 0).color;
const AXIS = new THREE.Vector3(...C.spinAxis).normalize();

// Compartilhadas por todas as instâncias.
let sharedGeometry: { solid: THREE.BufferGeometry; edges: THREE.BufferGeometry } | null = null;
function getGeometry() {
  if (!sharedGeometry) {
    const solid = new THREE.DodecahedronGeometry(C.radius, 0);
    sharedGeometry = { solid, edges: new THREE.EdgesGeometry(solid) };
  }
  return sharedGeometry;
}

/**
 * Poliedro: dodecaedro inteiro e liso, girando num eixo fixo com velocidade constante.
 * Cristal fosco com o núcleo visível dentro; sem `crystal`, pedra polida escura.
 */
export function Poliedro({ id }: { id: string }) {
  const { motion, q } = useSceneSettings();
  const pose = useOrganismPose(id);
  const vitals = useVitals(id);
  const { frame, counter, apply } = useStretchFrame();
  const selectable = useSelectable(id);
  const group = useRef<THREE.Group>(null);
  const shown = useCreatureCull(group, pose);
  const scale = useWorld().store.creatureScale();
  const solid = useRef<THREE.Group>(null);
  const pulse = useRef(C.nucleus.pulseMin);
  const phase = useMemo(() => phaseOf(id), [id]);
  const offset = phase * 1000;
  const time = useRef(offset);
  // Cada instância começa num ângulo diferente do mesmo giro regular.
  const initial = useMemo(() => new THREE.Quaternion().setFromAxisAngle(AXIS, phase * Math.PI * 2), [phase]);

  const { solid: geometry, edges } = getGeometry();
  const material = useMemo(
    () =>
      q.crystal
        ? new THREE.MeshPhysicalMaterial({
            color: '#d6e8f4',
            roughness: 0.28,
            metalness: 0,
            transmission: 0.92,
            thickness: 1.2,
            ior: 1.45,
            attenuationColor: new THREE.Color('#5d7fa8'),
            attenuationDistance: 2.5,
            // Brilho interno do núcleo difundido no cristal: as faces nunca ficam escuras.
            emissive: new THREE.Color(C.nucleus.color).multiplyScalar(0.07),
            flatShading: true,
            alphaHash: true,
          })
        : new THREE.MeshStandardMaterial({
            color: '#151b24',
            roughness: 0.22,
            metalness: 0.35,
            emissive: new THREE.Color(C.nucleus.color).multiplyScalar(0.06),
            flatShading: true,
            alphaHash: true,
          }),
    [q.crystal],
  );
  const edgeMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: C.nucleus.color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => edgeMaterial.dispose(), [edgeMaterial]);
  const step = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, dt) => {
    const s = clampDelta(dt) * motion;
    time.current += s;
    const g = group.current;
    if (!g || !solid.current || !shown.current) return;
    // Giro perfeitamente regular: mesmo eixo, mesma velocidade, sempre.
    step.setFromAxisAngle(AXIS, C.spinSpeed * s);
    solid.current.quaternion.premultiply(step);
    // Posição canônica do servidor + sobe e desce cosmético.
    const f = frame.current;
    if (!f) return;
    const life = scale * vitals.scale.current;
    const fade = vitals.fade.current;
    f.position.copy(pose.pos);
    f.position.y += Math.sin(time.current * 0.25) * C.bob * life;
    apply(pose.vel, vitals.stretch.current);
    g.scale.setScalar(life);
    const breath = (pulse.current - C.nucleus.pulseMin) / (C.nucleus.pulseMax - C.nucleus.pulseMin);
    edgeMaterial.opacity = (0.4 + 0.25 * breath) * fade;
    material.opacity = fade;
    requestCreatureGlow(id, FLOOR_COLOR, f.position.x, f.position.y, f.position.z, CREATURE_GLOW_RADIUS, (0.45 + 0.25 * breath) * vitals.glow.current * fade);
  });

  return (
    <group ref={frame} {...selectable}>
      <group ref={counter}>
        <group ref={group} visible={false}>
          <Nucleus config={C.nucleus} pulseRef={pulse} glowRef={vitals.glow} fadeRef={vitals.fade} haloScale={6} timeOffset={offset} />
          <group ref={solid} quaternion={initial}>
            <mesh geometry={geometry} material={material} />
            <lineSegments geometry={edges} material={edgeMaterial} />
          </group>
        </group>
      </group>
    </group>
  );
}
