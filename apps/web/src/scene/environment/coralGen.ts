type Vec3 = [number, number, number];

export interface Segment {
  start: Vec3;
  end: Vec3;
  radius: number;
  depth: number;
}

export interface CoralParams {
  /** Profundidade máxima de ramificação (o tronco é 0). */
  depth: number;
  /** Abertura média, em radianos, entre um ramo e o filho. */
  branchAngle: number;
  /** Fator de comprimento de cada geração em relação à anterior. */
  lengthDecay: number;
  /** Raio do tronco. */
  radius: number;
  /** Altura aproximada do coral inteiro. */
  height: number;
  /** 0 = arbusto 3D; 1 = leque plano no plano XY. */
  flatten?: number;
  /** Fração da altura gasta no tronco. */
  trunk?: number;
}

/** Afinamento por geração; depender só da profundidade garante raio monótono. */
const RADIUS_TAPER = 0.64;
/** Ramos nunca apontam para baixo além disso (componente y mínima da direção). */
const MIN_RISE = 0.22;

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Gira `v` em torno do eixo unitário `axis` (Rodrigues). */
function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  const d = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
  const x = cross(axis, v);
  return [
    v[0] * c + x[0] * s + axis[0] * d * (1 - c),
    v[1] * c + x[1] * s + axis[1] * d * (1 - c),
    v[2] * c + x[2] * s + axis[2] * d * (1 - c),
  ];
}

/** Ramificação recursiva em 3D: 2–3 filhos por nó, raio e comprimento decaindo com a profundidade. */
export function generateCoral(rng: () => number, p: CoralParams): Segment[] {
  const segments: Segment[] = [];

  const grow = (start: Vec3, dir: Vec3, length: number, depth: number) => {
    const end = add(start, dir, length);
    segments.push({ start, end, radius: p.radius * RADIUS_TAPER ** depth, depth });
    if (depth >= p.depth) return;

    const children = rng() < 0.4 ? 3 : 2;
    // Eixo perpendicular de referência; cada filho gira em torno de `dir` a partir dele.
    const ref: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const perp = normalize(cross(dir, ref));
    const spin = rng() * Math.PI * 2;
    for (let i = 0; i < children; i++) {
      const around = spin + (i / children) * Math.PI * 2 + (rng() - 0.5) * 0.8;
      const axis = normalize(rotate(perp, dir, around));
      let child = rotate(dir, axis, p.branchAngle * (0.7 + rng() * 0.6));
      // Leve tropismo para cima, e nunca abaixo do mínimo.
      child = normalize([child[0], child[1] + 0.25, child[2] * (1 - (p.flatten ?? 0))]);
      if (child[1] < MIN_RISE) child = normalize([child[0], MIN_RISE * 1.5, child[2]]);
      // A primeira geração parte de um comprimento próprio, para um tronco curto não encolher o coral inteiro.
      const base = depth === 0 ? p.height * 0.3 : length;
      grow(end, child, base * p.lengthDecay * (0.85 + rng() * 0.3), depth + 1);
    }
  };

  const lean = normalize([(rng() - 0.5) * 0.3, 1, (rng() - 0.5) * 0.3]);
  grow([0, 0, 0], lean, p.height * (p.trunk ?? 0.32), 0);
  return segments;
}
