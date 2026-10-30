import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motionScale } from './lib/motion';
import { parseQuality, QUALITY, type QualityLevel, type QualitySettings } from './lib/quality';

export interface SceneSettings {
  quality: QualityLevel;
  q: QualitySettings;
  motion: number;
  reducedMotion: boolean;
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function readReduced(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_QUERY).matches;
}

const SceneSettingsContext = createContext<SceneSettings | null>(null);

export function SceneSettingsProvider({ children }: { children: ReactNode }) {
  const [quality] = useState(() => parseQuality(window.location.search));
  const [reducedMotion, setReducedMotion] = useState(readReduced);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(REDUCED_QUERY);
    const onChange = () => setReducedMotion(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const value = useMemo<SceneSettings>(
    () => ({ quality, q: QUALITY[quality], motion: motionScale(reducedMotion), reducedMotion }),
    [quality, reducedMotion],
  );

  return <SceneSettingsContext.Provider value={value}>{children}</SceneSettingsContext.Provider>;
}

export function useSceneSettings(): SceneSettings {
  const settings = useContext(SceneSettingsContext);
  if (!settings) throw new Error('useSceneSettings fora de SceneSettingsProvider');
  return settings;
}
