import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { detectWebGL } from './lib/webgl';
import { PALETTE } from './lib/palette';
import { SceneSettingsProvider, useSceneSettings } from './settings';
import { Stage } from './scene/Stage';
import { DemoBadge } from './ui/DemoBadge';
import { InspectPanel } from './ui/InspectPanel';
import { SpeciesIndex } from './ui/SpeciesIndex';
import { ConnectionNotice } from './ui/ConnectionNotice';
import { Fallback } from './ui/Fallback';
import { LoadingOverlay } from './ui/LoadingOverlay';
import { WorldProvider, useWorld } from './services/WorldProvider';
import { isClick, type Point } from './lib/pointer';
import type { SocketLike } from './services/worldConnection';
import { PerfProbe, isPerfEnabled } from './ui/PerfProbe';

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

/** Esc fecha a seleção e solta o seguimento, em qualquer lugar da página. */
function EscapeClears() {
  const { selection } = useWorld();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') selection.clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);
  return null;
}

/** Monta dentro do Suspense: só roda depois que a cena inteira resolveu. */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return null;
}

function Scene({ onFail }: { onFail: () => void }) {
  const { q } = useSceneSettings();
  const { selection } = useWorld();
  const downAt = useRef<Point | null>(null);
  const [ready, setReady] = useState(false);
  const [perf] = useState(() => isPerfEnabled(window.location.search));

  return (
    <>
      <CanvasErrorBoundary onError={onFail}>
        <Canvas
          dpr={[1, q.maxDpr]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          style={{ position: 'fixed', inset: 0, background: PALETTE.bg }}
          onPointerMissed={(event) => {
            // Clique no vazio solta a seleção; arrasto da câmera não.
            const d = downAt.current;
            if (d && isClick(d, { x: event.clientX, y: event.clientY })) selection.clear();
          }}
          onCreated={({ gl, scene }) => {
            scene.background = null;
            gl.setClearColor(PALETTE.bg);
            gl.domElement.addEventListener('pointerdown', (event) => {
              downAt.current = { x: event.clientX, y: event.clientY };
            });
            gl.domElement.addEventListener('webglcontextlost', (event) => {
              event.preventDefault();
              onFail();
            });
          }}
        >
          {perf && <PerfProbe />}
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

const WORLD_URL: string = import.meta.env.VITE_WORLD_URL ?? 'ws://localhost:4000/socket';

export function App({
  webglAvailable = detectWebGL(),
  socketFactory,
}: {
  webglAvailable?: boolean;
  socketFactory?: (url: string) => SocketLike;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <WorldProvider url={WORLD_URL} socketFactory={socketFactory}>
    <SceneSettingsProvider>
      <EscapeClears />
      {!webglAvailable ? (
        <Fallback reason="no-webgl" />
      ) : failed ? (
        <Fallback reason="error" />
      ) : (
        <Scene onFail={() => setFailed(true)} />
      )}
      <DemoBadge />
      <SpeciesIndex />
      <InspectPanel />
      <ConnectionNotice />
    </SceneSettingsProvider>
    </WorldProvider>
  );
}
