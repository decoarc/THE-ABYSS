type Vec3 = [number, number, number];

export interface BoidState {
  /** xyz intercalado. */
  pos: Float32Array;
  vel: Float32Array;
  count: number;
  /** Fase de cada esporo: > 0 arrancada (decaindo), < 0 pausa (subindo até 0), 0 cruzeiro. */
  phase: Float32Array;
}

export interface BoidParams {
  bounds: { min: Vec3; max: Vec3 };
  maxSpeed: number;
  neighborRadius: number;
  separation: number;
  alignment: number;
  cohesion: number;
  /** Probabilidade por segundo de um esporo começar uma arrancada. */
  burstChance: number;
}

/** Maior passo interno; dt maior (aba em segundo plano) é cortado aqui também. */
const MAX_STEP = 0.05;
/** Faixa perto dos limites onde a força de retorno começa. */
const MARGIN = 1.2;
const RETURN_FORCE = 3;
const STEER = 2.2;
const CRUISE = 0.45;
const PAUSE = 0.1;
const BURST_SECONDS = 0.7;
const PAUSE_SECONDS = 1.4;

export function createBoids(count: number, rng: () => number, p: BoidParams): BoidState {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const { min, max } = p.bounds;
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) {
      // Nasce num núcleo central do volume, para começar já como um grupo.
      const c = (min[k] + max[k]) / 2, h = (max[k] - min[k]) / 2;
      pos[i * 3 + k] = c + (rng() - 0.5) * h;
      vel[i * 3 + k] = (rng() - 0.5) * p.maxSpeed * 0.4;
    }
  }
  return { pos, vel, count, phase: new Float32Array(count) };
}

/** Avança a simulação in place: separação, alinhamento, coesão via grade espacial, retorno suave nos limites. */
export function stepBoids(s: BoidState, dt: number, p: BoidParams, rng: () => number): void {
  if (!(dt > 0)) return;
  dt = Math.min(dt, MAX_STEP);
  const { pos, vel, count, phase } = s;
  const { min, max } = p.bounds;
  const r = p.neighborRadius;
  const r2 = r * r;

  // Grade espacial: ordenação por contagem das células (sem Map, sem alocação por vizinho).
  const nx = Math.max(1, Math.ceil((max[0] - min[0]) / r) + 2);
  const ny = Math.max(1, Math.ceil((max[1] - min[1]) / r) + 2);
  const nz = Math.max(1, Math.ceil((max[2] - min[2]) / r) + 2);
  const cellOf = new Int32Array(count);
  const cellCount = new Int32Array(nx * ny * nz + 1);
  const ix = (v: number, k: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor((v - min[k]) / r) + 1));
  for (let i = 0; i < count; i++) {
    const c = ix(pos[i * 3], 0, nx) + nx * (ix(pos[i * 3 + 1], 1, ny) + ny * ix(pos[i * 3 + 2], 2, nz));
    cellOf[i] = c;
    cellCount[c + 1]++;
  }
  for (let c = 0; c < nx * ny * nz; c++) cellCount[c + 1] += cellCount[c];
  const cellStart = cellCount.slice();
  const sorted = new Int32Array(count);
  const fill = cellCount.slice();
  for (let i = 0; i < count; i++) sorted[fill[cellOf[i]]++] = i;

  const acc = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const px = pos[i * 3], py = pos[i * 3 + 1], pz = pos[i * 3 + 2];
    const cx = ix(px, 0, nx), cy = ix(py, 1, ny), cz = ix(pz, 2, nz);
    let n = 0, sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, mx = 0, my = 0, mz = 0;
    for (let dz = -1; dz <= 1; dz++) {
      const zz = cz + dz;
      if (zz < 0 || zz >= nz) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = cy + dy;
        if (yy < 0 || yy >= ny) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx;
          if (xx < 0 || xx >= nx) continue;
          const c = xx + nx * (yy + ny * zz);
          for (let q = cellStart[c]; q < cellStart[c + 1]; q++) {
            const j = sorted[q];
            if (j === i) continue;
            const ox = pos[j * 3] - px, oy = pos[j * 3 + 1] - py, oz = pos[j * 3 + 2] - pz;
            const d2 = ox * ox + oy * oy + oz * oz;
            if (d2 > r2 || d2 === 0) continue;
            n++;
            const w = 1 / d2;
            sx -= ox * w; sy -= oy * w; sz -= oz * w;
            ax += vel[j * 3]; ay += vel[j * 3 + 1]; az += vel[j * 3 + 2];
            mx += ox; my += oy; mz += oz;
          }
        }
      }
    }
    if (n > 0) {
      acc[i * 3] = sx * p.separation * 0.1 + (ax / n - vel[i * 3]) * p.alignment + (mx / n) * p.cohesion;
      acc[i * 3 + 1] = sy * p.separation * 0.1 + (ay / n - vel[i * 3 + 1]) * p.alignment + (my / n) * p.cohesion;
      acc[i * 3 + 2] = sz * p.separation * 0.1 + (az / n - vel[i * 3 + 2]) * p.alignment + (mz / n) * p.cohesion;
    }
    // Retorno suave: cresce dentro da margem perto de cada limite.
    for (let k = 0; k < 3; k++) {
      const v = pos[i * 3 + k];
      if (v < min[k] + MARGIN) acc[i * 3 + k] += ((min[k] + MARGIN - v) / MARGIN) * RETURN_FORCE;
      else if (v > max[k] - MARGIN) acc[i * 3 + k] -= ((v - (max[k] - MARGIN)) / MARGIN) * RETURN_FORCE;
    }
  }

  for (let i = 0; i < count; i++) {
    // Ciclo arrancada → pausa → cruzeiro.
    if (phase[i] > 0) {
      phase[i] = Math.max(0, phase[i] - dt / BURST_SECONDS);
      if (phase[i] === 0) phase[i] = -1;
    } else if (phase[i] < 0) {
      phase[i] = Math.min(0, phase[i] + dt / PAUSE_SECONDS);
    } else if (rng() < p.burstChance * dt) {
      phase[i] = 1;
    }
    const target = phase[i] > 0 ? p.maxSpeed : phase[i] < 0 ? p.maxSpeed * PAUSE : p.maxSpeed * CRUISE;

    let vx = vel[i * 3] + acc[i * 3] * dt;
    let vy = vel[i * 3 + 1] + acc[i * 3 + 1] * dt;
    let vz = vel[i * 3 + 2] + acc[i * 3 + 2] * dt;
    let speed = Math.hypot(vx, vy, vz);
    if (speed < 1e-6) {
      vx = rng() - 0.5; vy = (rng() - 0.5) * 0.3; vz = rng() - 0.5;
      speed = Math.hypot(vx, vy, vz);
    }
    // Aproxima a velocidade escalar do alvo da fase, sem nunca passar do máximo.
    const next = Math.min(p.maxSpeed, speed + (target - speed) * Math.min(1, STEER * dt));
    const k = next / speed;
    vel[i * 3] = vx * k;
    vel[i * 3 + 1] = vy * k;
    vel[i * 3 + 2] = vz * k;
    for (let a = 0; a < 3; a++) {
      const o = i * 3 + a;
      pos[o] += vel[o] * dt;
      // Rede de segurança: nunca além de meia margem fora do volume.
      const lo = min[a] - MARGIN * 0.5, hi = max[a] + MARGIN * 0.5;
      if (pos[o] < lo) { pos[o] = lo; vel[o] = Math.abs(vel[o]); }
      else if (pos[o] > hi) { pos[o] = hi; vel[o] = -Math.abs(vel[o]); }
    }
  }
}
