import { PALETTE } from '../lib/palette';
import { CameraRig } from './CameraRig';
import { Effects } from './Effects';
import { Lighting } from './Lighting';
import { Seabed } from './Seabed';

export function Stage() {
  return (
    <>
      <fogExp2 attach="fog" args={[PALETTE.bg, 0.045]} />
      <CameraRig />
      <Lighting />
      <Seabed />
      <Effects />
    </>
  );
}
