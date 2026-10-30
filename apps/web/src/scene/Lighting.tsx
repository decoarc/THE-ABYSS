import { PALETTE } from '../lib/palette';

export function Lighting() {
  return (
    <>
      <ambientLight color={PALETTE.teal} intensity={0.5} />
      <hemisphereLight args={['#2c6f80', PALETTE.bg, 1.1]} />
      <directionalLight color="#9fd4e0" intensity={0.7} position={[4, 20, -6]} />
      {/* Calor da chaminé herói, na origem do mundo. */}
      <pointLight color={PALETTE.amber} intensity={7} distance={8} decay={2} position={[0, 1.6, 0]} />
    </>
  );
}
