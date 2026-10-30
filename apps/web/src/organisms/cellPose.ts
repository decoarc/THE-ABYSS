import type { CelulaConfig } from './creatureConfig';

type Vec3 = [number, number, number];

export interface CellPose {
  position: Vec3;
  /** Direção da frente da célula, unitária. */
  heading: Vec3;
  /** Rolagem em torno do próprio eixo, rad. */
  roll: number;
}

/**
 * Vai e volta entre `from` e `to`: acelera e desacelera em cosseno (pico = `speed`),
 * para em cada ponta por `turnSeconds` girando a frente 180° no plano horizontal.
 */
export function cellPose(t: number, c: CelulaConfig): CellPose {
  const d: Vec3 = [c.to[0] - c.from[0], c.to[1] - c.from[1], c.to[2] - c.from[2]];
  const length = Math.hypot(...d);
  const dir: Vec3 = [d[0] / length, d[1] / length, d[2] / length];
  // Perpendicular horizontal: a virada acontece de lado, não de cambalhota.
  const side = Math.hypot(dir[0], dir[2]) || 1;
  const perp: Vec3 = [-dir[2] / side, 0, dir[0] / side];

  // Com s = L(1 - cos(πτ/T))/2, a velocidade de pico é πL/(2T): escolhe T para o pico ser `speed`.
  const travel = (Math.PI * length) / (2 * c.speed);
  const period = 2 * (travel + c.turnSeconds);
  const phase = ((t % period) + period) % period;

  let s: number;
  let heading: Vec3;
  const turn = (k: number, from: number): Vec3 => {
    // k de 0 a 1: gira de `from`·dir para -`from`·dir passando pela perpendicular.
    const a = Math.PI * (0.5 - 0.5 * Math.cos(Math.PI * k));
    const cos = Math.cos(a) * from, sin = Math.sin(a);
    return [dir[0] * cos + perp[0] * sin, dir[1] * cos + perp[1] * sin, dir[2] * cos + perp[2] * sin];
  };
  const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

  if (phase < travel) {
    s = (1 - Math.cos((Math.PI * phase) / travel)) / 2;
    heading = dir;
  } else if (phase < travel + c.turnSeconds) {
    s = 1;
    heading = turn((phase - travel) / c.turnSeconds, 1);
  } else if (phase < 2 * travel + c.turnSeconds) {
    s = (1 + Math.cos((Math.PI * (phase - travel - c.turnSeconds)) / travel)) / 2;
    heading = scale(dir, -1);
  } else {
    s = 0;
    heading = turn((phase - 2 * travel - c.turnSeconds) / c.turnSeconds, -1);
  }
  const hl = Math.hypot(...heading);
  return {
    position: [c.from[0] + d[0] * s, c.from[1] + d[1] * s, c.from[2] + d[2] * s],
    heading: [heading[0] / hl, heading[1] / hl, heading[2] / hl],
    roll: (t * c.rollSpeed) % (Math.PI * 2),
  };
}
