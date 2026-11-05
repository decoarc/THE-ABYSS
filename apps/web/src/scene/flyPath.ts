import type { Vec3 } from '../services/wire';

/**
 * Percurso fixo da câmera livre para as medições de desempenho (`?flypath=1`).
 * Uma volta fechada: Jardim → Floresta (por dentro das esponjas) → Jardim → Planície → Jardim.
 * A curva é uma Catmull-Rom pelos pontos abaixo; cada trecho dura o seu comprimento / SPEED.
 */
const WAYPOINTS: Vec3[] = [
  [0, 6, 18], // quadro herói
  [-8, 5, 4],
  [-16, 4.5, -10],
  // Jardim → Floresta: as duas regiões só se sobrepõem numa faixa estreita em volta de (−24, −15).
  [-24, 4, -15],
  [-34, 3, -20],
  [-46, 2.2, -16], // pior quadro da Floresta (Task 11), olhando para dentro das esponjas
  [-56, 2.2, -27],
  [-58, 2.5, -38],
  [-46, 3, -44],
  [-36, 3.5, -32],
  [-24, 5, -15.5], // Floresta → Jardim
  [-10, 5, -12],
  [16, 5, -14], // Jardim → Planície
  [36, 4, -22],
  [56, 3, -30],
  [76, 3.5, -22],
  [72, 4.5, -6],
  [52, 5, -8],
  [34, 5.5, -10], // Planície → Jardim
  [18, 6, -2],
  [10, 6, 14],
];

/** Velocidade média ao longo do percurso (u/s); o nado livre chega a 6. */
const SPEED = 4;
/** O olhar mira o ponto do percurso este tanto à frente, um pouco abaixo. */
const LOOK_AHEAD_S = 2.5;
const LOOK_DROP = 0.8;

const n = WAYPOINTS.length;
const durations = WAYPOINTS.map((p, i) => {
  const q = WAYPOINTS[(i + 1) % n];
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / SPEED;
});

/** Duração de uma volta inteira, em segundos. */
export const FLY_PATH_LAP_S = durations.reduce((a, b) => a + b, 0);

export function isFlyPathEnabled(search: string): boolean {
  return new URLSearchParams(search).get('flypath') === '1';
}

/** Ponto do percurso no instante `t` (s, dá a volta), escrito em `out`. */
function pointAt(t: number, out: Vec3): Vec3 {
  let local = ((t % FLY_PATH_LAP_S) + FLY_PATH_LAP_S) % FLY_PATH_LAP_S;
  let i = 0;
  while (i < n - 1 && local >= durations[i]) {
    local -= durations[i];
    i++;
  }
  const u = Math.min(1, local / durations[i]);
  const p0 = WAYPOINTS[(i - 1 + n) % n];
  const p1 = WAYPOINTS[i];
  const p2 = WAYPOINTS[(i + 1) % n];
  const p3 = WAYPOINTS[(i + 2) % n];
  const u2 = u * u;
  const u3 = u2 * u;
  for (let k = 0; k < 3; k++) {
    out[k] =
      0.5 *
      (2 * p1[k] +
        (p2[k] - p0[k]) * u +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
        (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * u3);
  }
  return out;
}

/** Pose do percurso no instante `t`: onde a câmera está e para onde olha. Sem alocação. */
export function flyPathPose<T extends { pos: Vec3; lookAt: Vec3 }>(t: number, out: T): T {
  pointAt(t, out.pos);
  pointAt(t + LOOK_AHEAD_S, out.lookAt);
  out.lookAt[1] -= LOOK_DROP;
  return out;
}
