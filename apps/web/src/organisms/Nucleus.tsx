import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clampDelta } from '../lib/motion';
import { useSceneSettings } from '../settings';
import { nucleusPulse, type NucleusConfig } from './creatureConfig';

let haloTexture: THREE.Texture | null = null;

/** Gradiente radial suave, gerado uma vez e compartilhado por todos os halos. */
export function getHaloTexture(): THREE.Texture {
  if (haloTexture) return haloTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  haloTexture = new THREE.CanvasTexture(canvas);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

/** O pulso continua visível com movimento reduzido, só que bem mais lento. */
export const MIN_PULSE_RATE = 0.3;

/**
 * Núcleo: esfera emissiva acima do limiar do bloom + halo aditivo. Escreve a
 * intensidade atual em `pulseRef` a cada quadro para o corpo reagir.
 */
export function Nucleus({
  config,
  pulseRef,
  haloScale = 7,
}: {
  config: NucleusConfig;
  pulseRef?: RefObject<number>;
  haloScale?: number;
}) {
  const { motion } = useSceneSettings();
  const time = useRef(0);
  const core = useMemo(
    () => new THREE.MeshBasicMaterial({ color: config.color, toneMapped: false }),
    [config.color],
  );
  const halo = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: getHaloTexture(),
        color: config.color,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [config.color],
  );
  const base = useMemo(() => new THREE.Color(config.color), [config.color]);
  const sprite = useRef<THREE.Sprite>(null);

  useFrame((_, dt) => {
    time.current += clampDelta(dt) * Math.max(motion, MIN_PULSE_RATE);
    const intensity = nucleusPulse(time.current, config);
    if (pulseRef) pulseRef.current = intensity;
    core.color.copy(base).multiplyScalar(intensity);
    halo.opacity = 0.25 + 0.15 * intensity;
    sprite.current?.scale.setScalar(config.radius * haloScale * (0.85 + 0.08 * intensity));
  });

  return (
    <group>
      <mesh material={core}>
        <icosahedronGeometry args={[config.radius, 3]} />
      </mesh>
      <sprite ref={sprite} material={halo} />
    </group>
  );
}
