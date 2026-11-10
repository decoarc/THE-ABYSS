// Bússola no chão: anel fino, marcas a cada 30° e seta para a frente (sem texto).
// Materiais e geometrias compartilhados no módulo (fixos, sem programa novo por espécie); nada aqui
// recebe raio de pointer, então não atrapalha alças nem arrasto de peças.
import { useMemo } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../lib/palette';
import type { Blueprint } from '../services/wire';
import { compassLayout } from './compassMath';

const OPACITY = 0.42;
const noRaycast = () => null;
const material = new THREE.MeshBasicMaterial({
  color: PALETTE.cyan,
  transparent: true,
  opacity: OPACITY,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

// Tudo em raio 1 e escalado pelo grupo; a frente é +y.
const ring = new THREE.RingGeometry(0.985, 1, 128);

const ticks = (() => {
  const pos: number[] = [];
  const w = 0.004;
  for (let a = 0; a < 360; a += 30) {
    const t = (a * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const long = a % 90 === 0 ? 0.1 : 0.06;
    const p = (r: number, off: number) => [c * r - s * off, s * r + c * off, 0];
    pos.push(...p(1 - long, -w), ...p(1, -w), ...p(1, w), ...p(1 - long, -w), ...p(1, w), ...p(1 - long, w));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
})();

const chevron = (() => {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.22);
  sh.lineTo(0.14, -0.04);
  sh.lineTo(0, 0.03);
  sh.lineTo(-0.14, -0.04);
  sh.closePath();
  return new THREE.ShapeGeometry(sh);
})();

/** Bússola sob a criatura (espaço centrado da prévia); a altura e o raio seguem o corpo. */
export function Compass({ bp }: { bp: Blueprint }) {
  const { radius, z } = useMemo(() => compassLayout(bp), [bp]);
  const k = 1 / radius; // tamanhos fixos em unidades do mundo, dentro do grupo escalado pelo raio
  return (
    <group position={[0, 0, z]} scale={radius}>
      <mesh geometry={ring} material={material} raycast={noRaycast} />
      <mesh geometry={ticks} material={material} raycast={noRaycast} />
      <mesh geometry={chevron} material={material} position={[0, 1, 0]} scale={[0.9 * k, 0.9 * k, 1]} raycast={noRaycast} />
    </group>
  );
}
