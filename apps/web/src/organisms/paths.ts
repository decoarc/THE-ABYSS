type Vec3 = [number, number, number];

export interface LissajousParams {
  ax: number;
  ay: number;
  az: number;
  /** Frequências em ciclos por segundo. */
  fx: number;
  fy: number;
  fz: number;
  center: Vec3;
}

const TAU = Math.PI * 2;

/** Curva de Lissajous 3D: fechada se as frequências forem comensuráveis, senão nunca se repete exatamente. */
export function lissajousPath(t: number, p: LissajousParams, out: Vec3 = [0, 0, 0]): Vec3 {
  out[0] = p.center[0] + p.ax * Math.sin(TAU * p.fx * t);
  out[1] = p.center[1] + p.ay * Math.sin(TAU * p.fy * t + 1.3);
  out[2] = p.center[2] + p.az * Math.sin(TAU * p.fz * t + 0.7);
  return out;
}
