import type { Selection, SelectionState } from './selection';
import type { ConnectionStatus, WorldStore } from './worldStore';
import { readCamera, requestCameraPose } from '../scene/cameraPose';
import { FLY_PATH_LAP_S } from '../scene/flyPath';
import { seabedHeight } from '../scene/terrain';
import type { Vec3 } from './wire';

/** Superfície exposta em `window.__abyss` quando a URL tem `?debug=1`, para os testes e2e. */
export interface AbyssDebug {
  status(): ConnectionStatus;
  worldId(): string | null;
  lastTick(): number;
  roster(): string[];
  positionsAt(tick: number): Record<string, Vec3> | null;
  selection(): SelectionState;
  /** Resumo canônico da comida ao fim do tick (para comparar observadores). */
  foodDigestAt(tick: number): string | null;
  foodCounts(): { floraSum: number; particles: number };
  /** Põe a câmera livre em `pos` olhando para `lookAt` (para capturas). */
  setCamera(pos: Vec3, lookAt: Vec3): void;
  /** Câmera agora: posição, altura do leito embaixo dela e o andamento do percurso fixo (`?flypath=1`). */
  camera(): { pos: Vec3; floor: number; pathS: number | null; lapS: number };
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
    foodDigestAt: (tick) => store.food().digestAt(tick),
    foodCounts: () => store.food().counts(),
    setCamera: (pos, lookAt) => requestCameraPose(pos, lookAt),
    camera: () => {
      const { pos, pathS } = readCamera();
      return { pos, floor: seabedHeight(pos[0], pos[2]), pathS, lapS: FLY_PATH_LAP_S };
    },
  };
  return () => {
    delete target.__abyss;
  };
}
