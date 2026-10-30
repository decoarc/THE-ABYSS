import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useSceneSettings } from '../settings';

export function Effects() {
  const { q } = useSceneSettings();
  if (!q.postprocessing) return null;
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur luminanceThreshold={0.6} luminanceSmoothing={0.2} intensity={0.7} />
      <Vignette offset={0.25} darkness={0.75} />
    </EffectComposer>
  );
}
