import { createRng } from './random';

/** Ruído de valor 2D suave (interpolação quíntica), determinístico pela semente. */
export function createNoise2D(seed: number): (x: number, y: number) => number {
  const rng = createRng(seed);
  const size = 256;
  const values = new Float32Array(size);
  const perm = new Uint8Array(size * 2);
  for (let i = 0; i < size; i++) {
    values[i] = rng() * 2 - 1;
    perm[i] = i;
  }
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < size; i++) perm[i + size] = perm[i];

  const lattice = (ix: number, iy: number) => values[perm[(ix & 255) + perm[iy & 255]]];
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = fade(x - x0), fy = fade(y - y0);
    const a = lattice(x0, y0), b = lattice(x0 + 1, y0);
    const c = lattice(x0, y0 + 1), d = lattice(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Soma fractal de oitavas; resultado aproximadamente em [-1, 1]. */
export function fbm2D(noise: (x: number, y: number) => number, x: number, y: number, octaves = 4): number {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
