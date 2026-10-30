import { PALETTE } from '../lib/palette';

export function Lighting() {
  return (
    <>
      <ambientLight color={PALETTE.teal} intensity={0.35} />
      <hemisphereLight args={[PALETTE.teal, PALETTE.bg, 0.4]} />
      <directionalLight color="#9fd4e0" intensity={0.35} position={[4, 20, -6]} />
      {/* Calor da chaminé herói, na origem do mundo. */}
      <pointLight color={PALETTE.amber} intensity={22} distance={16} decay={2} position={[0, 1.6, 0]} />
    </>
  );
}
