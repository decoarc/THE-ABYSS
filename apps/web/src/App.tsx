import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { debugEnabled, installDebugBridge, registerProgramCounter, type AbyssDebug } from './services/debugBridge';
import type { SocketLike } from './services/worldConnection';
import { PerfProbe, isPerfEnabled } from './ui/PerfProbe';
import { CreateButton } from './ui/CreateButton';
import { GenesisNotice } from './ui/GenesisNotice';
import { CreationScreen, initialDraft, type Draft, type PreviewProps } from './genesis/CreationScreen';
import { EditorPreview } from './genesis/EditorPreview';
import { confirmSpecies, type ConfirmResult } from './genesis/genesisApi';
import { navigate, useRoute, type Route } from './genesis/route';

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

/** Esc fecha a seleção e solta o seguimento, em qualquer lugar da página; a câmera fica onde está. */
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

/** Com `?debug=1`, expõe o mundo em `window.__abyss` para os testes e2e. */
function DebugBridge() {
  const { store, selection } = useWorld();
  useEffect(() => {
    if (!debugEnabled(window.location.search)) return;
    return installDebugBridge(window as unknown as { __abyss?: AbyssDebug }, store, selection);
  }, [store, selection]);
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
            // Clique no vazio solta a seleção; arrasto do olhar (ou da órbita no toque) não.
            const d = downAt.current;
            if (d && isClick(d, { x: event.clientX, y: event.clientY })) selection.clear();
          }}
          onCreated={({ gl, scene }) => {
            registerProgramCounter(() => gl.info.programs?.length ?? 0);
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

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

/** Sem WebGL a prévia não aparece, mas o formulário continua funcionando. */
function NoPreview() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, font: `12px/1.6 ${MONO}`, color: PALETTE.fg, opacity: 0.6, textAlign: 'center' }}>
      Sem WebGL a criatura não aparece aqui, mas dá para montar e liberar.
    </div>
  );
}

function SafePreview(props: PreviewProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return <NoPreview />;
  return (
    <CanvasErrorBoundary onError={() => setFailed(true)}>
      <EditorPreview {...props} />
    </CanvasErrorBoundary>
  );
}

function confirmMessage(result: ConfirmResult): string {
  if (result === 'taken') return 'Este e-mail já criou uma espécie.';
  if (result === 'invalid') return 'Este link não vale mais. Monte de novo e peça outro link.';
  if (result === 'slow_down') return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  return `${result.published.name} foi liberada no abismo. Procure por ela no índice.`;
}

/**
 * Rota `#confirmar=<token>`: confirma uma vez só por token (o Set sobrevive ao efeito duplo do
 * StrictMode), tira o token do endereço (recarregar não confirma de novo) e devolve o aviso.
 */
function useConfirmation(route: Route): [string | null, () => void] {
  const [notice, setNotice] = useState<string | null>(null);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (route.kind !== 'confirm') return;
    const { token } = route;
    navigate('', { replace: true });
    if (seen.current.has(token)) return;
    seen.current.add(token);
    confirmSpecies(token).then(
      (result) => setNotice(confirmMessage(result)),
      () => setNotice('Não foi possível falar com o abismo. Abra o link do e-mail de novo.'),
    );
  }, [route]);
  const clear = useCallback(() => setNotice(null), []);
  return [notice, clear];
}

export function App({
  webglAvailable: webglProp,
  socketFactory,
}: {
  webglAvailable?: boolean;
  socketFactory?: (url: string) => SocketLike;
}) {
  // Uma vez só: cada teste cria um contexto WebGL, e o App rerenderiza a cada mudança do rascunho.
  const [webglAvailable] = useState(() => webglProp ?? detectWebGL());
  const [failed, setFailed] = useState(false);
  const route = useRoute();
  // O rascunho mora aqui: sair da criação e voltar mantém a criatura enquanto a página estiver aberta.
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [notice, clearNotice] = useConfirmation(route);
  const creating = route.kind === 'create';

  return (
    <WorldProvider url={WORLD_URL} socketFactory={socketFactory}>
    <SceneSettingsProvider>
      <EscapeClears />
      <DebugBridge />
      {creating ? (
        <CreationScreen
          draft={draft}
          onDraftChange={setDraft}
          onBack={() => navigate('')}
          Preview={webglAvailable ? SafePreview : NoPreview}
        />
      ) : (
        <>
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
          <CreateButton onClick={() => navigate('#criar')} />
          {notice && <GenesisNotice message={notice} onDone={clearNotice} />}
        </>
      )}
    </SceneSettingsProvider>
    </WorldProvider>
  );
}
