import type { Selection, SelectionState } from './selection';
import type { ConnectionStatus, WorldStore } from './worldStore';
import { requestCameraPose } from '../scene/cameraPose';
import type { Vec3 } from './wire';

/** Superfície exposta em `window.__abyss` quando a URL tem `?debug=1`, para os testes e2e. */
export interface AbyssDebug {
  status(): ConnectionStatus;
  worldId(): string | null;
  lastTick(): number;
  roster(): string[];
  positionsAt(tick: number): Record<string, Vec3> | null;
  selection(): SelectionState;
  /** Põe a câmera livre em `pos` olhando para `lookAt` (para capturas). */
  setCamera(pos: Vec3, lookAt: Vec3): void;
}

export function debugEnabled(search: string): boolean {
  return new URLSearchParams(search).get('debug') === '1';
}

export function installDebugBridge(
  target: { __abyss?: AbyssDebug },
  store: WorldStore,
  selection: Selection,
): () => void {
  target.__abyss = {
    status: () => store.status(),
    worldId: () => store.worldId(),
    lastTick: () => store.lastTick(),
    roster: () => store.roster().map((o) => o.id),
    positionsAt: (tick) => store.positionsAt(tick),
    selection: () => selection.get(),
    setCamera: (pos, lookAt) => requestCameraPose(pos, lookAt),
  };
  return () => {
    delete target.__abyss;
  };
}
