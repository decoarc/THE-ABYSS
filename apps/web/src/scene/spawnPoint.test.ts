import { pickSpawn } from './spawnPoint';
import { FLY } from './freeFly';
import { CAMERA } from './cameraConfig';
import { seabedHeight } from './terrain';
import { edgeDepth } from '../world/map';
import type { Vec3 } from '../services/wire';

/** Gerador determinístico (mulberry32) para sortear vários pontos de partida. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function expectValid(pos: Vec3) {
  expect(pos[1]).toBeGreaterThanOrEqual(seabedHeight(pos[0], pos[2]) + FLY.floorClearance - 1e-9);
  expect(pos[1]).toBeLessThanOrEqual(FLY.ceiling);
  expect(edgeDepth(pos[0], pos[2])).toBeGreaterThanOrEqual(FLY.edgeHard - 1e-9);
}

it('com organismos, nasce a 7–11 do organismo escolhido, acima do chão, olhando para ele', () => {
  // Inclui organismos na borda do mapa (Planície leste, Jardim sul) e no fundo da faixa.
  const organisms: Vec3[] = [
    [0, 3, 0],
    [106.5, 2, -28],
    [0, 1.5, 29.5],
    [-48, 7.5, -30],
  ];
  for (let seed = 1; seed <= 200; seed++) {
    const { pos, lookAt } = pickSpawn(rng(seed), organisms, []);
    const chosen = organisms.find((o) => o.every((v, i) => v === lookAt[i]));
    expect(chosen).toBeDefined();
    const d = dist(pos, chosen!);
    expect(d).toBeGreaterThanOrEqual(7);
    expect(d).toBeLessThanOrEqual(11);
    expect(pos[1]).toBeGreaterThan(chosen![1]); // olha levemente para baixo
    expectValid(pos);
  }
});

it('pickSpawn sem organismos', () => {
  const flora: [number, number, number][] = [
    [5, 5, 0.1],
    [-40, -25, 0.8],
    [10, -8, 0.3],
  ];
  for (let seed = 1; seed <= 50; seed++) {
    const { pos, lookAt } = pickSpawn(rng(seed), [], flora);
    expect(lookAt[0]).toBe(-40); // a única mancha com nível > 0,3
    expect(lookAt[2]).toBe(-25);
    const d = dist(pos, lookAt);
    expect(d).toBeGreaterThanOrEqual(7);
    expect(d).toBeLessThanOrEqual(11);
    expectValid(pos);
  }
});

it('sem nada à vista, devolve o quadro herói', () => {
  const spawn = pickSpawn(rng(1), [], [[0, 0, 0.2]]);
  expect(spawn).toEqual({ pos: CAMERA.position, lookAt: CAMERA.target });
  expect(spawn.pos).not.toBe(CAMERA.position); // cópia: quem recebe pode mexer
});
