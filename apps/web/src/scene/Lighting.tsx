import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE } from '../lib/palette';
import { regionTint } from './regionTint';

/** Valores aprovados no Jardim; fora dele a luz de cima segue a ambiente de `regionTint`. */
const AMBIENT = 0.5;
const HEMI = 1.1;
const DIRECTIONAL = 0.7;

export function Lighting() {
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const directional = useRef<THREE.DirectionalLight>(null);
  const tint = useMemo(() => regionTint(0, 0), []);

  // A cada quadro só mudam valores (cores e intensidades), nunca a quantidade de luzes:
  // trocar a quantidade obriga o three a recompilar os shaders no meio do voo.
  useFrame(({ camera, scene, gl }) => {
    regionTint(camera.position.x, camera.position.z, tint);
    const k = tint.ambient / AMBIENT;
    if (ambient.current) ambient.current.intensity = tint.ambient;
    if (hemi.current) {
      hemi.current.color.copy(tint.sky);
      hemi.current.intensity = HEMI * k;
    }
    if (directional.current) directional.current.intensity = DIRECTIONAL * k;
    if (scene.fog) scene.fog.color.copy(tint.fog);
    gl.setClearColor(tint.fog);
  });

  return (
    <>
      <ambientLight ref={ambient} color={PALETTE.teal} intensity={AMBIENT} />
      <hemisphereLight ref={hemi} args={['#2c6f80', PALETTE.bg, HEMI]} />
      <directionalLight ref={directional} color="#9fd4e0" intensity={DIRECTIONAL} position={[4, 20, -6]} />
      {/* Calor da chaminé herói, na origem do mundo. */}
      <pointLight color={PALETTE.amber} intensity={7} distance={8} decay={2} position={[0, 1.6, 0]} />
    </>
  );
}
