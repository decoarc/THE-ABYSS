import { PALETTE } from '../lib/palette';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { Lighting } from './Lighting';
import { Seabed } from './Seabed';
import { LightShafts } from './environment/LightShafts';
import { Particles } from './environment/Particles';
import { Rocks } from './environment/Rocks';
import { Vents } from './environment/Vents';

export function Stage() {
  return (
    <>
      <fogExp2 attach="fog" args={[PALETTE.bg, 0.045]} />
      <CameraRig />
      <Lighting />
      <Seabed />
      <Vents />
      <Rocks />
      <LightShafts />
      <Particles />
      <Effects />
    </>
  );
}
