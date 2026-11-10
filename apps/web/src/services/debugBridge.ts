import type { Selection, SelectionState } from './selection';
import type { ConnectionStatus, Vitals, WorldStore } from './worldStore';
import { readCamera, requestCameraPose } from '../scene/cameraPose';
import { FLY_PATH_LAP_S } from '../scene/flyPath';
import { seabedHeight } from '../scene/terrain';
import type { Blueprint, OrganismInfo, SpeciesInfo, Vec3 } from './wire';

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
  /** Roster completo (vivos e fantasmas) com espécie, estágio e posição de nascimento. */
  organisms(): readonly OrganismInfo[];
  /** Estado vital de um organismo (energia, jovem, dividindo, fantasma); null se desconhecido. */
  vitals(id: string): Vitals | null;
  species(): readonly SpeciesInfo[];
  /** Planta de uma espécie; null se desconhecida ou sem planta (as de teste). */
  blueprintOf(speciesId: string): Blueprint | null;
  /** Posição interpolada de um organismo agora; null se desconhecido. */
  position(id: string): Vec3 | null;
  /** Põe a câmera livre em `pos` olhando para `lookAt` (para capturas). */
  setCamera(pos: Vec3, lookAt: Vec3): void;
  /** Espécies extintas (id -> ms do servidor). */
  extinct(): Record<string, number>;
  /** Seleciona um organismo (como o clique no índice). */
  select(id: string): void;
  /** Liga ou solta o Seguir da seleção atual. */
  follow(on: boolean): void;
  /** Programas de shader compilados agora (`renderer.info.programs`); null antes do canvas. */
  programs(): number | null;
  /**
   * Só para medição: tira todos os vivos do roster de uma vez (tick sintético que os remove) e deixa o próximo
   * tick real cair no caminho de resync do cliente, que remonta todos juntos, como numa aba que volta do
   * segundo plano. Devolve quantos foram removidos.
   */
  forceResync(): number;
  /** Câmera agora: posição, altura do leito embaixo dela e o andamento do percurso fixo (`?flypath=1`). */
  camera(): { pos: Vec3; floor: number; pathS: number | null; lapS: number };
}

let programCounter: (() => number) | null = null;

/** O canvas registra como contar os programas compilados (usado só pelo `?debug=1`). */
export function registerProgramCounter(fn: () => number): void {
  programCounter = fn;
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
    organisms: () => store.roster(),
    vitals: (id) => {
      const out: Vitals = { energy: 0, juvenile: false, dividing: false, maturedAtMs: null, dividingSinceMs: null, dyingSinceMs: null };
      return store.vitals(id, out) ? out : null;
    },
    species: () => store.species(),
    blueprintOf: (id) => store.species().find((s) => s.id === id)?.blueprint ?? null,
    position: (id) => {
      const p: Vec3 = [0, 0, 0];
      return store.sample(id, performance.now(), p, [0, 0, 0]) ? p : null;
    },
    extinct: () => Object.fromEntries(store.extinct()),
    select: (id) => selection.select(id),
    follow: (on) => selection.setFollowing(on),
    programs: () => (programCounter ? programCounter() : null),
    forceResync: () => {
      const worldId = store.worldId();
      if (worldId === null) return 0;
      const probe: Vitals = { energy: 0, juvenile: false, dividing: false, maturedAtMs: null, dividingSinceMs: null, dyingSinceMs: null };
      const ids = store.roster().filter((o) => store.vitals(o.id, probe) && probe.dyingSinceMs === null).map((o) => o.id);
      const now = performance.now();
      store.applyTick(
        {
          world_id: worldId,
          tick: store.lastTick() + 1,
          server_ms: store.serverNow(now),
          sp: [],
          o: [],
          b: [],
          d: ids.map((id) => [id, 'predation'] as [string, 'predation']),
          x: [],
          f: [],
          ps: [],
          pr: [],
        },
        now,
      );
      return ids.length;
    },
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
