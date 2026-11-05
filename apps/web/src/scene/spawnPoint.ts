import type { Vec3 } from '../services/wire';
import { CAMERA } from './cameraConfig';
import { WORLD_ENV, constrainCamera, wasConstrained } from './freeFly';

/** Distância da câmera ao que ela olha ao nascer. */
const NEAR = 7;
const FAR = 11;
/** Elevação do olhar (rad acima do horizonte, visto do alvo): de leve para organismos, mais alto para o chão. */
const ORGANISM_ELEVATION: [number, number] = [0.15, 0.45];
const FLORA_ELEVATION: [number, number] = [0.35, 0.6];
/** Mancha de flora que conta como "comida à vista". */
const MIN_FLORA_LEVEL = 0.3;
/** Altura acima do leito para onde a câmera olha numa mancha de flora. */
const FLORA_LOOK_HEIGHT = 0.3;
/** Sorteios de direção antes de desistir e nascer do lado de dentro do mapa. */
const TRIES = 8;

export interface Spawn {
  pos: Vec3;
  lookAt: Vec3;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Um ponto a NEAR–FAR de `at`, na direção horizontal `angle`, que os limites da câmera não precisaram mexer. */
function around(rng: () => number, at: Vec3, elevation: [number, number]): Vec3 {
  const d = lerp(NEAR, FAR, rng());
  const el = lerp(elevation[0], elevation[1], rng());
  const place = (angle: number): Vec3 => [
    at[0] + Math.cos(angle) * Math.cos(el) * d,
    at[1] + Math.sin(el) * d,
    at[2] + Math.sin(angle) * Math.cos(el) * d,
  ];
  const untouched = (p: Vec3) => {
    const q: Vec3 = [p[0], p[1], p[2]];
    return !wasConstrained(constrainCamera(q, WORLD_ENV)) && WORLD_ENV.edgeDepth(q[0], q[2]) >= 0;
  };
  for (let i = 0; i < TRIES; i++) {
    const p = place(rng() * Math.PI * 2);
    if (untouched(p)) return p;
  }
  // Perto da borda: nasce do lado de dentro, rumo ao centro da região.
  const [ix, iz] = WORLD_ENV.inward(at[0], at[2]);
  const p = place(ix === 0 && iz === 0 ? 0 : Math.atan2(iz, ix));
  constrainCamera(p, WORLD_ENV);
  return p;
}

/**
 * Ponto de partida do visitante: perto de um organismo sorteado; sem organismos, perto de uma
 * mancha de flora crescida; sem nada à vista, o quadro herói do Jardim.
 */
export function pickSpawn(rng: () => number, organisms: Vec3[], flora: [number, number, number][]): Spawn {
  if (organisms.length > 0) {
    const o = organisms[Math.floor(rng() * organisms.length)];
    const lookAt: Vec3 = [o[0], o[1], o[2]];
    return { pos: around(rng, lookAt, ORGANISM_ELEVATION), lookAt };
  }
  const grown = flora.filter((f) => f[2] > MIN_FLORA_LEVEL);
  if (grown.length > 0) {
    const [x, z] = grown[Math.floor(rng() * grown.length)];
    const lookAt: Vec3 = [x, WORLD_ENV.floor(x, z) + FLORA_LOOK_HEIGHT, z];
    return { pos: around(rng, lookAt, FLORA_ELEVATION), lookAt };
  }
  return { pos: [...CAMERA.position], lookAt: [...CAMERA.target] };
}

