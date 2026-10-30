import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { FLOOR_SLOTS, glowOf, setCreatureGlow } from '../scene/floorGlow';
import { useSceneSettings } from '../settings';
import { POLIEDRO as C } from './creatureConfig';
import { Nucleus } from './Nucleus';

const FLOOR_COLOR = glowOf(C.nucleus.color, 0, 0, 0, 0).color;
const AXIS = new THREE.Vector3(...C.spinAxis).normalize();

/**
 * Poliedro: dodecaedro inteiro e liso, girando num eixo fixo com velocidade constante.
 * Cristal fosco com o núcleo visível dentro; sem `crystal`, pedra polida escura.
 */
export function Poliedro() {
  const { motion, q } = useSceneSettings();
  const group = useRef<THREE.Group>(null);
  const solid = useRef<THREE.Group>(null);
  const pulse = useRef(C.nucleus.pulseMin);
  const time = useRef(0);

  const geometry = useMemo(() => new THREE.DodecahedronGeometry(C.radius, 0), []);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);
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
          })
        : new THREE.MeshStandardMaterial({
            color: '#151b24',
            roughness: 0.22,
            metalness: 0.35,
            emissive: new THREE.Color(C.nucleus.color).multiplyScalar(0.06),
            flatShading: true,
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
  const step = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, dt) => {
    const s = clampDelta(dt) * motion;
    time.current += s;
    const g = group.current;
    if (!g || !solid.current) return;
    // Giro perfeitamente regular: mesmo eixo, mesma velocidade, sempre.
    step.setFromAxisAngle(AXIS, C.spinSpeed * s);
    solid.current.quaternion.premultiply(step);
    g.position.set(C.position[0], C.position[1] + Math.sin(time.current * 0.25) * C.bob, C.position[2]);
    const breath = (pulse.current - C.nucleus.pulseMin) / (C.nucleus.pulseMax - C.nucleus.pulseMin);
    edgeMaterial.opacity = 0.4 + 0.25 * breath;
    setCreatureGlow(FLOOR_SLOTS.poliedro, FLOOR_COLOR, g.position.x, g.position.y, g.position.z, 0.45 + 0.25 * breath);
  });

  return (
    <group ref={group}>
      <Nucleus config={C.nucleus} pulseRef={pulse} haloScale={6} />
      <group ref={solid}>
        <mesh geometry={geometry} material={material} />
        <lineSegments geometry={edges} material={edgeMaterial} />
      </group>
    </group>
  );
}
