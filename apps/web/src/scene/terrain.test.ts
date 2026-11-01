import { createRng } from '../lib/random';
import { MAP } from '../world/map';
import { JARDIM_CORE, JARDIM_FADE, legacyJardimHeight, seabedHeight } from './terrain';

function std(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
}

/** Pontos sorteados num disco de raio `r` em torno de (cx, cz). */
function disc(seed: number, n: number, cx: number, cz: number, r: number): [number, number][] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r;
    return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
  });
}

const region = (id: string) => MAP.regions.find((r) => r.id === id)!;

it('Jardim intacto', () => {
  const pts = disc(7, 200, 0, 0, 26);
  for (const [x, z] of pts) expect(seabedHeight(x, z)).toBe(legacyJardimHeight(x, z));
  // A própria borda do miolo também.
  expect(seabedHeight(26, 0)).toBe(legacyJardimHeight(26, 0));
});

it('contínuo', () => {
  const xs = MAP.regions.flatMap((r) => [r.center[0] - r.radius - 30, r.center[0] + r.radius + 30]);
  const zs = MAP.regions.flatMap((r) => [r.center[1] - r.radius - 30, r.center[1] + r.radius + 30]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [z0, z1] = [Math.min(...zs), Math.max(...zs)];
  const step = 0.5;
  const nx = Math.floor((x1 - x0) / step) + 1;
  let prevRow = new Float64Array(nx);
  let row = new Float64Array(nx);
  let worst = 0;
  for (let j = 0; z0 + j * step <= z1; j++) {
    const z = z0 + j * step;
    for (let i = 0; i < nx; i++) {
      row[i] = seabedHeight(x0 + i * step, z);
      if (i > 0) worst = Math.max(worst, Math.abs(row[i] - row[i - 1]));
      if (j > 0) worst = Math.max(worst, Math.abs(row[i] - prevRow[i]));
    }
    [prevRow, row] = [row, prevRow];
  }
  expect(worst).toBeLessThanOrEqual(0.25);
});

it('Planície mais plana', () => {
  const p = region('planicie');
  const plain = disc(11, 400, p.center[0], p.center[1], p.radius - 10).map(([x, z]) => seabedHeight(x, z));
  const garden = disc(13, 400, 0, 0, 26).map(([x, z]) => seabedHeight(x, z));
  expect(std(plain)).toBeLessThan(std(garden));
});

/** y_min do servidor (1,5) menos o maior raio efetivo (Poliedro, 1,2 × 0,5). */
const FLOOR_LIMIT = 0.9;

it('chão abaixo da faixa das criaturas em cada região', () => {
  for (const r of MAP.regions) {
    let worst = -Infinity;
    for (let x = r.center[0] - r.radius; x <= r.center[0] + r.radius; x += 0.5)
      for (let z = r.center[1] - r.radius; z <= r.center[1] + r.radius; z += 0.5) {
        if (Math.hypot(x - r.center[0], z - r.center[1]) > r.radius) continue;
        const d = Math.hypot(x, z);
        if (d <= JARDIM_CORE) continue;
        const h = seabedHeight(x, z);
        // Na passagem a partir do miolo aprovado (que já passa de 0,9 em r = 26), o chão nunca sobe acima do leito aprovado.
        const limit = d < JARDIM_CORE + JARDIM_FADE ? Math.max(FLOOR_LIMIT, legacyJardimHeight(x, z)) : FLOOR_LIMIT;
        worst = Math.max(worst, h - limit);
      }
    expect(worst, r.id).toBeLessThanOrEqual(0);
  }
});
