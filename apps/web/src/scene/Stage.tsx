import { PALETTE } from '../lib/palette';
import { Creatures } from '../organisms/Creatures';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { Lighting } from './Lighting';
import { Seabed } from './Seabed';
import { Corals } from './environment/Corals';
import { LightShafts } from './environment/LightShafts';
import { Pads } from './environment/Pads';
import { Particles } from './environment/Particles';
import { Rocks } from './environment/Rocks';
import { Tufts } from './environment/Tufts';
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
      <Corals />
      <Pads />
      <Tufts />
      <LightShafts />
      <Particles />
      <Creatures />
      <Effects />
    </>
  );
}
