import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { detectWebGL } from './lib/webgl';
import { PALETTE } from './lib/palette';
import { SceneSettingsProvider, useSceneSettings } from './settings';
import { Stage } from './scene/Stage';
import { DemoBadge } from './ui/DemoBadge';
import { Fallback } from './ui/Fallback';
import { LoadingOverlay } from './ui/LoadingOverlay';

class CanvasErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Monta dentro do Suspense: só roda depois que a cena inteira resolveu. */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}

function Scene({ onFail }: { onFail: () => void }) {
  const { q } = useSceneSettings();
  const [ready, setReady] = useState(false);

  return (
    <>
      <CanvasErrorBoundary onError={onFail}>
        <Canvas
          dpr={[1, q.maxDpr]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          style={{ position: 'fixed', inset: 0, background: PALETTE.bg }}
          onCreated={({ gl, scene }) => {
            scene.background = null;
            gl.setClearColor(PALETTE.bg);
            gl.domElement.addEventListener('webglcontextlost', (event) => {
              event.preventDefault();
              onFail();
            });
          }}
        >
          <Suspense fallback={null}>
            <Stage />
            <Ready onReady={() => setReady(true)} />
          </Suspense>
        </Canvas>
      </CanvasErrorBoundary>
      <LoadingOverlay visible={!ready} />
    </>
  );
}

export function App({ webglAvailable = detectWebGL() }: { webglAvailable?: boolean }) {
  const [failed, setFailed] = useState(false);

  return (
    <SceneSettingsProvider>
      {!webglAvailable ? (
        <Fallback reason="no-webgl" />
      ) : failed ? (
        <Fallback reason="error" />
      ) : (
        <Scene onFail={() => setFailed(true)} />
      )}
      <DemoBadge />
    </SceneSettingsProvider>
  );
}
