// Desenho procedural das espécies criadas: corpo (tubo pela espinha) e peças (formas-modelo fixas),
// tudo em geometria; os materiais são os mesmos para qualquer planta (materials.ts).
import * as THREE from 'three';
import type { Blueprint, BlueprintPart, PartKind } from '../services/wire';
import { bodyRadius } from './blueprint';

/** Ordem fixa dos tipos (a do catálogo): o atributo `aKind` é o índice aqui. */
export const PART_KINDS = [
  'raspador', 'filtro', 'mandibula', 'flagelo', 'cilios', 'aleta', 'ocelo', 'cardume', 'gancho', 'placa',
] as const satisfies readonly PartKind[];

export const kindIndex = (k: PartKind): number => (PART_KINDS as readonly string[]).indexOf(k);

// ---------------------------------------------------------------------------------------------
// Espinha: Catmull-Rom uniforme por (0, x, y) com raio interpolado do mesmo jeito,
// reamostrada por comprimento de arco (`at` 0..1 = cauda..cabeça).
// Local: x da planta → +y (frente), y da planta → +z (cima); +x local = lado direito.

const SAMPLES = 256;
const FINE = 2048;

interface Spine {
  /** Centros (3 por amostra), tangentes unitárias, raios e d(raio)/d(arco). */
  c: Float64Array;
  t: Float64Array;
  r: Float64Array;
  dr: Float64Array;
  /** Comprimento do tubo (arco da espinha). */
  len: number;
}

const spines = new WeakMap<object, Spine>();

function cr(p0: number, p1: number, p2: number, p3: number, f: number): number {
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
}

function spineOf(bp: Blueprint): Spine {
  const key = bp.body.spine;
  const hit = spines.get(key);
  if (hit) return hit;
  const pts = bp.body.spine;
  const n = pts.length;
  const at = (i: number, k: number) => {
    // Pontas estendidas linearmente (P₋₁ = 2P₀ − P₁).
    if (i < 0) return 2 * pts[0][k] - pts[1][k];
    if (i >= n) return 2 * pts[n - 1][k] - pts[n - 2][k];
    return pts[i][k];
  };
  const rmin = Math.min(...pts.map((p) => p[2])) * 0.5;
  // Amostragem fina pelo parâmetro.
  const fy = new Float64Array(FINE + 1);
  const fz = new Float64Array(FINE + 1);
  const fr = new Float64Array(FINE + 1);
  const len = new Float64Array(FINE + 1);
  for (let j = 0; j <= FINE; j++) {
    const u = (j / FINE) * (n - 1);
    const i = Math.min(Math.floor(u), n - 2);
    const f = u - i;
    fy[j] = cr(at(i - 1, 0), at(i, 0), at(i + 1, 0), at(i + 2, 0), f);
    fz[j] = cr(at(i - 1, 1), at(i, 1), at(i + 1, 1), at(i + 2, 1), f);
    fr[j] = Math.max(rmin, cr(at(i - 1, 2), at(i, 2), at(i + 1, 2), at(i + 2, 2), f));
    if (j > 0) len[j] = len[j - 1] + Math.hypot(fy[j] - fy[j - 1], fz[j] - fz[j - 1]);
  }
  const total = len[FINE] || 1;
  // Reamostra por arco.
  const c = new Float64Array(SAMPLES * 3);
  const r = new Float64Array(SAMPLES);
  let j = 0;
  for (let k = 0; k < SAMPLES; k++) {
    const s = (k / (SAMPLES - 1)) * total;
    while (j < FINE - 1 && len[j + 1] < s) j++;
    const seg = len[j + 1] - len[j];
    const w = seg > 0 ? Math.min(Math.max((s - len[j]) / seg, 0), 1) : 0;
    c[k * 3] = 0;
    c[k * 3 + 1] = fy[j] + (fy[j + 1] - fy[j]) * w;
    c[k * 3 + 2] = fz[j] + (fz[j + 1] - fz[j]) * w;
    r[k] = fr[j] + (fr[j + 1] - fr[j]) * w;
  }
  const t = new Float64Array(SAMPLES * 3);
  const dr = new Float64Array(SAMPLES);
  const ds = total / (SAMPLES - 1);
  for (let k = 0; k < SAMPLES; k++) {
    const a = Math.max(k - 1, 0);
    const b = Math.min(k + 1, SAMPLES - 1);
    const ty = c[b * 3 + 1] - c[a * 3 + 1];
    const tz = c[b * 3 + 2] - c[a * 3 + 2];
    const l = Math.hypot(ty, tz) || 1;
    t[k * 3 + 1] = ty / l;
    t[k * 3 + 2] = tz / l;
    dr[k] = (r[b] - r[a]) / ((b - a) * ds);
  }
  const out = { c, t, r, dr, len: total };
  spines.set(key, out);
  return out;
}

interface Axis {
  cy: number;
  cz: number;
  ty: number;
  tz: number;
  r: number;
  dr: number;
}

/** Eixo do tubo numa fração `f` do comprimento do tubo (sem as tampas). */
function axisAt(s: Spine, f: number, out: Axis): Axis {
  const u = Math.min(Math.max(f, 0), 1) * (SAMPLES - 1);
  const i = Math.min(Math.floor(u), SAMPLES - 2);
  const w = u - i;
  const lerp = (arr: Float64Array, k: number, stride: number) => arr[i * stride + k] + (arr[(i + 1) * stride + k] - arr[i * stride + k]) * w;
  out.cy = lerp(s.c, 1, 3);
  out.cz = lerp(s.c, 2, 3);
  const ty = lerp(s.t, 1, 3);
  const tz = lerp(s.t, 2, 3);
  const l = Math.hypot(ty, tz) || 1;
  out.ty = ty / l;
  out.tz = tz / l;
  out.r = lerp(s.r, 0, 1);
  out.dr = lerp(s.dr, 0, 1);
  return out;
}

/**
 * Comprimento da superfície ao longo de um meridiano: quarto de arco da tampa da cauda (r·π/2),
 * o tubo, e o quarto de arco da tampa da cabeça. `at` é a fração disso: 0 = ponta da cauda, 1 = ponta da cabeça.
 */
function arcs(s: Spine) {
  const qT = (s.r[0] * Math.PI) / 2;
  const qH = (s.r[SAMPLES - 1] * Math.PI) / 2;
  return { qT, qH, L: qT + s.len + qH };
}

type Region = { cap: -1 | 0 | 1; psi: number };

/** Em que parte da superfície `at` cai, deixando em `a` o eixo daquele trecho (o da ponta, nas tampas). */
function locate(s: Spine, at: number, a: Axis): Region {
  const { qT, L } = arcs(s);
  const u = Math.min(Math.max(at, 0), 1) * L;
  if (u < qT) {
    axisAt(s, 0, a);
    return { cap: -1, psi: (qT - u) / a.r };
  }
  if (u > qT + s.len) {
    axisAt(s, 1, a);
    return { cap: 1, psi: (u - qT - s.len) / a.r };
  }
  axisAt(s, s.len > 0 ? (u - qT) / s.len : 0.5, a);
  return { cap: 0, psi: 0 };
}

export interface SurfaceFrame {
  position: THREE.Vector3;
  /** Normal da superfície, para fora. */
  normal: THREE.Vector3;
  /** Tangente da superfície ao longo do meridiano, para a cabeça; perpendicular à normal. */
  tangent: THREE.Vector3;
}

// "Cima" perpendicular ao eixo: U = (0, −tz, ty); lado direito: +x. Radial n(θ) = cos θ·U + sin θ·X.
function surfaceInto(a: Axis, reg: Region, around: number, out: SurfaceFrame): SurfaceFrame {
  const cs = Math.cos(around);
  const nx = Math.sin(around);
  const ny = -a.tz * cs;
  const nz = a.ty * cs;
  if (reg.cap === 0) {
    out.position.set(nx * a.r, a.cy + ny * a.r, a.cz + nz * a.r);
    // Raio variando inclina a normal: n − r'·T (e a tangente da superfície, T + r'·n).
    out.normal.set(nx, ny - a.dr * a.ty, nz - a.dr * a.tz).normalize();
    out.tangent.set(a.dr * nx, a.ty + a.dr * ny, a.tz + a.dr * nz).normalize();
    return out;
  }
  // Tampa hemisférica: ψ = 0 no anel da ponta do tubo, π/2 na ponta (normal = ±T).
  const d = reg.cap;
  const cp = Math.cos(reg.psi);
  const sp = Math.sin(reg.psi);
  out.position.set(nx * a.r * cp, a.cy + (ny * cp + d * a.ty * sp) * a.r, a.cz + (nz * cp + d * a.tz * sp) * a.r);
  out.normal.set(nx * cp, ny * cp + d * sp * a.ty, nz * cp + d * sp * a.tz).normalize();
  out.tangent.set(-d * sp * nx, -d * sp * ny + cp * a.ty, -d * sp * nz + cp * a.tz).normalize();
  return out;
}

const newFrame = (): SurfaceFrame => ({ position: new THREE.Vector3(), normal: new THREE.Vector3(), tangent: new THREE.Vector3() });

/**
 * Ponto da superfície em (at, around), no **espaço da planta** (x local = lado, y local = x da planta,
 * z local = y da planta), sem centralizar. A malha desenhada é este espaço menos `centroidOffset(bp)`.
 */
export function surfaceFrame(bp: Blueprint, at: number, around: number): SurfaceFrame {
  const s = spineOf(bp);
  const a = {} as Axis;
  return surfaceInto(a, locate(s, at, a), around, newFrame());
}

/** Inverso de `surfaceFrame` (mesmo espaço da planta): o (at, around) cujo ponto fica mais perto de `point`. */
export function surfaceCoords(bp: Blueprint, point: THREE.Vector3): { at: number; around: number } {
  const s = spineOf(bp);
  const a = {} as Axis;
  const f = newFrame();
  const err = (at: number) => {
    const reg = locate(s, at, a);
    // Componentes no plano perpendicular ao eixo daquele trecho: sobre U = (0, −tz, ty) e sobre X.
    const th = Math.atan2(point.x, -a.tz * (point.y - a.cy) + a.ty * (point.z - a.cz));
    surfaceInto(a, reg, th, f);
    return { e: f.position.distanceToSquared(point), th };
  };
  const N = 2 * SAMPLES;
  let best = 0;
  let bestE = Infinity;
  for (let k = 0; k < N; k++) {
    const e = err(k / (N - 1)).e;
    if (e < bestE) {
      bestE = e;
      best = k;
    }
  }
  // Refina por seção áurea entre as amostras vizinhas.
  let lo = Math.max(best - 1, 0) / (N - 1);
  let hi = Math.min(best + 1, N - 1) / (N - 1);
  const g = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 30; it++) {
    const m1 = hi - g * (hi - lo);
    const m2 = lo + g * (hi - lo);
    if (err(m1).e < err(m2).e) hi = m2;
    else lo = m1;
  }
  const at = (lo + hi) / 2;
  return { at, around: err(at).th };
}

/**
 * Centróide da espinha no espaço local (0, x̄, ȳ): o centro de `bodyRadius`, da pose, do anel de seleção
 * e do brilho no chão. A geometria desenhada já vem deslocada por −centroidOffset.
 */
export function centroidOffset(bp: Blueprint): THREE.Vector3 {
  const pts = bp.body.spine;
  return new THREE.Vector3(0, pts.reduce((m, p) => m + p[0], 0) / pts.length, pts.reduce((m, p) => m + p[1], 0) / pts.length);
}

/** Lugar do núcleo, já centralizado: o ponto do eixo mais perto do centróide (sempre dentro do corpo). */
export function nucleusAnchor(bp: Blueprint): { position: THREE.Vector3; radius: number } {
  const s = spineOf(bp);
  const c = centroidOffset(bp);
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < SAMPLES; k++) {
    const d = (s.c[k * 3 + 1] - c.y) ** 2 + (s.c[k * 3 + 2] - c.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return { position: new THREE.Vector3(0, s.c[best * 3 + 1], s.c[best * 3 + 2]).sub(c), radius: s.r[best] };
}

function centerPositions(pos: number[], c: THREE.Vector3) {
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= c.x;
    pos[i + 1] -= c.y;
    pos[i + 2] -= c.z;
  }
}

// ---------------------------------------------------------------------------------------------
// Corpo

const BODY_RADIAL = 24;
const BODY_RINGS = 48;
const CAP_RINGS = 6;

export function buildBodyGeometry(bp: Blueprint): THREE.BufferGeometry {
  const s = spineOf(bp);
  const { qT, L } = arcs(s);
  const pos: number[] = [];
  const nrm: number[] = [];
  const along: number[] = [];
  const around: number[] = [];
  const a = {} as Axis;
  const f = newFrame();
  const ring = (reg: Region, al: number) => {
    for (let i = 0; i <= BODY_RADIAL; i++) {
      const th = -Math.PI + (i / BODY_RADIAL) * Math.PI * 2;
      surfaceInto(a, reg, th, f);
      pos.push(f.position.x, f.position.y, f.position.z);
      nrm.push(f.normal.x, f.normal.y, f.normal.z);
      along.push(al);
      around.push(th);
    }
  };
  // Tampa da cauda (da ponta até o anel do tubo), o tubo, e a tampa da cabeça; `aAlong` é o mesmo `at`.
  axisAt(s, 0, a);
  const r0 = a.r;
  for (let k = CAP_RINGS; k >= 1; k--) {
    const psi = (k / CAP_RINGS) * (Math.PI / 2);
    ring({ cap: -1, psi }, (qT - psi * r0) / L);
  }
  for (let j = 0; j < BODY_RINGS; j++) {
    const fr = j / (BODY_RINGS - 1);
    axisAt(s, fr, a);
    ring({ cap: 0, psi: 0 }, (qT + fr * s.len) / L);
  }
  axisAt(s, 1, a);
  const r1 = a.r;
  for (let k = 1; k <= CAP_RINGS; k++) {
    const psi = (k / CAP_RINGS) * (Math.PI / 2);
    ring({ cap: 1, psi }, (qT + s.len + psi * r1) / L);
  }
  const rings = CAP_RINGS * 2 + BODY_RINGS;
  const w = BODY_RADIAL + 1;
  const idx: number[] = [];
  for (let j = 0; j < rings - 1; j++) {
    for (let i = 0; i < BODY_RADIAL; i++) {
      const p = j * w + i;
      const q = p + 1;
      const r = p + w;
      const t = r + 1;
      idx.push(p, q, r, q, t, r);
    }
  }
  // Centraliza no centróide da espinha (o mesmo centro de `bodyRadius` e da pose).
  centerPositions(pos, centroidOffset(bp));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute('aAround', new THREE.Float32BufferAttribute(around, 1));
  g.setIndex(idx);
  let r2 = 0;
  for (let i = 0; i < pos.length; i += 3) r2 = Math.max(r2, pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.sqrt(r2));
  return g;
}

// ---------------------------------------------------------------------------------------------
// Peças: formas-modelo no referencial da peça (raiz na origem, +y para fora, +z para a cabeça,
// +x = y × z), em tamanho 1; cada instância é girada, escalada e posta na superfície.

class Builder {
  p: number[] = [];
  n: number[] = [];
  t: number[] = [];
  lum: number[] = [];
  bend: number[] = [];
  ph: number[] = [];
  kind: number[] = [];
  idx: number[] = [];
  get count() {
    return this.p.length / 3;
  }
  vert(p: THREE.Vector3, n: THREE.Vector3, t: number, lum: number, bend: THREE.Vector3, ph: number): number {
    this.p.push(p.x, p.y, p.z);
    this.n.push(n.x, n.y, n.z);
    this.t.push(t);
    this.lum.push(lum);
    this.bend.push(bend.x, bend.y, bend.z);
    this.ph.push(ph);
    this.kind.push(0);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }
}

interface Style {
  lum?: (t: number) => number;
  bend: THREE.Vector3;
  phase?: number;
}

const ZERO = new THREE.Vector3();
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Tubo por uma polilinha suave; `t` vai de 0 (raiz) a 1 (ponta). */
function tube(b: Builder, path: THREE.Vector3[], r0: number, r1: number, rings: number, sides: number, st: Style) {
  const curve = new THREE.CatmullRomCurve3(path);
  const pts = curve.getPoints(rings - 1);
  const start = b.count;
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  let ref = new THREE.Vector3(1, 0, 0);
  for (let k = 0; k < rings; k++) {
    const a = pts[Math.max(k - 1, 0)];
    const c = pts[Math.min(k + 1, rings - 1)];
    tan.subVectors(c, a).normalize();
    if (Math.abs(tan.dot(ref)) > 0.9) ref = new THREE.Vector3(0, 0, 1);
    side.crossVectors(tan, ref).normalize();
    up.crossVectors(side, tan).normalize();
    const t = k / (rings - 1);
    const r = r0 + (r1 - r0) * t;
    for (let i = 0; i < sides; i++) {
      const phi = (i / sides) * Math.PI * 2;
      n.copy(side).multiplyScalar(Math.cos(phi)).addScaledVector(up, Math.sin(phi));
      p.copy(pts[k]).addScaledVector(n, r);
      b.vert(p, n, t, st.lum ? st.lum(t) : 0, st.bend, st.phase ?? 0);
    }
  }
  for (let k = 0; k < rings - 1; k++) {
    for (let i = 0; i < sides; i++) {
      const a = start + k * sides + i;
      const q = start + k * sides + ((i + 1) % sides);
      const c = a + sides;
      const d = q + sides;
      b.tri(a, c, q);
      b.tri(q, c, d);
    }
  }
}

function sphere(b: Builder, c: THREE.Vector3, r: number, sy: number, wSeg: number, hSeg: number, t: number, st: Style) {
  const start = b.count;
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let j = 0; j <= hSeg; j++) {
    const v = (j / hSeg) * Math.PI;
    for (let i = 0; i <= wSeg; i++) {
      const u = (i / wSeg) * Math.PI * 2;
      n.set(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
      p.set(c.x + n.x * r, c.y + n.y * r * sy, c.z + n.z * r);
      b.vert(p, n, t, st.lum ? st.lum(t) : 0, st.bend, st.phase ?? 0);
    }
  }
  for (let j = 0; j < hSeg; j++) {
    for (let i = 0; i < wSeg; i++) {
      const a = start + j * (wSeg + 1) + i;
      const q = a + 1;
      const c2 = a + wSeg + 1;
      const d = c2 + 1;
      b.tri(a, q, c2);
      b.tri(q, d, c2);
    }
  }
}

type Template = (b: Builder) => void;

const TEMPLATES: Record<PartKind, Template> = {
  // Disco de dentes virado para fora.
  raspador(b) {
    const st: Style = { bend: ZERO };
    const center = b.vert(v3(0, 0.05, 0), v3(0, 1, 0), 0, 0, ZERO, 0);
    const rim = 16;
    const first = b.count;
    for (let i = 0; i < rim; i++) {
      const a = (i / rim) * Math.PI * 2;
      b.vert(v3(Math.cos(a) * 0.2, 0.03, Math.sin(a) * 0.2), v3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3).normalize(), 0.3, 0, ZERO, 0);
    }
    for (let i = 0; i < rim; i++) b.tri(center, first + ((i + 1) % rim), first + i);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const base = v3(Math.cos(a) * 0.17, 0.03, Math.sin(a) * 0.17);
      const tip = v3(Math.cos(a) * 0.24, 0.15, Math.sin(a) * 0.24);
      tube(b, [base, base.clone().lerp(tip, 0.5), tip], 0.03, 0.002, 3, 4, st);
    }
  },
  // Leque de cerdas que balançam devagar.
  filtro(b) {
    for (let i = 0; i < 9; i++) {
      const a = -0.95 + (i / 8) * 1.9;
      const dir = v3(Math.sin(a), Math.cos(a) * 0.95, Math.cos(a) * 0.3).normalize();
      const path = [0, 0.35, 0.7, 1].map((s) => dir.clone().multiplyScalar(s * 0.5).add(v3(0, 0, s * s * 0.08)));
      tube(b, path, 0.018, 0.004, 5, 3, { bend: v3(0, 0, 0.1), phase: i * 0.45, lum: (t) => 0.25 * t * t });
    }
  },
  // Duas pinças curvas saindo pela normal (na ponta da cabeça, para a frente) e se fechando.
  mandibula(b) {
    for (const sx of [-1, 1]) {
      const path = [v3(0.07 * sx, 0, 0), v3(0.13 * sx, 0.14, 0.03), v3(0.1 * sx, 0.3, 0.04), v3(0.01 * sx, 0.4, 0.0)];
      tube(b, path, 0.045, 0.006, 9, 5, { bend: v3(0.1 * sx, 0, 0) });
    }
  },
  // Fio longo que afina: sai pela normal (na ponta da cauda, para trás) e se curva para a cauda.
  flagelo(b) {
    const path = [v3(0, 0, 0), v3(0, 0.3, -0.05), v3(0, 0.6, -0.2), v3(0, 0.88, -0.42), v3(0, 1.1, -0.7)];
    tube(b, path, 0.032, 0.006, 36, 5, { bend: v3(0.22, 0, 0) });
  },
  // Fileira de fios curtos ao longo do corpo; a fase anda na fileira (onda).
  cilios(b) {
    for (let i = 0; i < 9; i++) {
      const z = -0.28 + (i / 8) * 0.56;
      tube(b, [v3(0, 0, z), v3(0, 0.09, z - 0.01), v3(0, 0.17, z - 0.04)], 0.012, 0.003, 4, 3, {
        bend: v3(0, 0, 0.08),
        phase: i * 0.7,
      });
    }
  },
  // Lâmina plana, varrida para trás.
  aleta(b) {
    const U = 5;
    const V = 6;
    const start = b.count;
    const n = v3(1, 0, 0);
    for (let j = 0; j <= V; j++) {
      const v = j / V;
      const width = 1 - 0.75 * v * v;
      for (let i = 0; i <= U; i++) {
        const u = i / U;
        const zRoot = 0.18 - u * 0.4;
        const mid = -0.02 - 0.22 * v;
        const z = mid + (zRoot + 0.02) * width;
        b.vert(v3(0, v * 0.42, z), n, v, 0, v3(0.2, 0, 0), 0);
      }
    }
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < U; i++) {
        const a = start + j * (U + 1) + i;
        b.tri(a, a + U + 1, a + 1);
        b.tri(a + 1, a + U + 1, a + U + 2);
      }
    }
  },
  // Esfera meio enterrada, com íris luminosa por cima.
  ocelo(b) {
    sphere(b, v3(0, 0.03, 0), 0.09, 1, 10, 6, 0, { bend: ZERO });
    sphere(b, v3(0, 0.105, 0), 0.05, 0.55, 8, 4, 1, { bend: ZERO, lum: () => 1 });
  },
  // Filamento fino com pontos fracos de luz.
  cardume(b) {
    const path = [v3(0, 0, 0), v3(0, 0.25, -0.1), v3(0, 0.45, -0.3), v3(0, 0.55, -0.55)];
    const st: Style = { bend: v3(0.1, 0, 0) };
    tube(b, path, 0.012, 0.004, 14, 3, st);
    const curve = new THREE.CatmullRomCurve3(path);
    for (const t of [0.3, 0.5, 0.7, 0.9]) sphere(b, curve.getPoint(t), 0.022, 1, 6, 4, t, { ...st, lum: () => 0.55 });
  },
  // Haste e arco virado para a frente.
  gancho(b) {
    const R = 0.12;
    const path = [v3(0, 0, 0), v3(0, 0.05, 0)];
    for (let k = 1; k <= 6; k++) {
      const phi = (k / 6) * Math.PI * 0.85;
      path.push(v3(0, 0.1 + R * Math.sin(phi), R * (1 - Math.cos(phi))));
    }
    tube(b, path, 0.028, 0.008, 16, 5, { bend: ZERO });
  },
  // Escama facetada deitada na pele.
  placa(b) {
    const apex = v3(0, 0.07, -0.03);
    const rim = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      return v3(Math.cos(a) * 0.2, 0.005, Math.sin(a) * 0.24);
    });
    const n = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    for (let i = 0; i < 6; i++) {
      const p = rim[i];
      const q = rim[(i + 1) % 6];
      e1.subVectors(q, apex);
      e2.subVectors(p, apex);
      n.crossVectors(e1, e2).normalize();
      if (n.y < 0) n.negate();
      const a = b.vert(apex, n, 0.5, 0, ZERO, 0);
      const c = b.vert(q, n, 0, 0, ZERO, 0);
      const d = b.vert(p, n, 0, 0, ZERO, 0);
      b.tri(a, c, d);
    }
  },
};

const templates = new Map<PartKind, Builder>();
function templateOf(kind: PartKind): Builder {
  let t = templates.get(kind);
  if (!t) {
    t = new Builder();
    TEMPLATES[kind](t);
    templates.set(kind, t);
  }
  return t;
}

/** Escala das peças: acompanha um pouco o tamanho do corpo. */
const partScale = (bp: Blueprint) => Math.min(Math.max(0.5 + 0.7 * bodyRadius(bp), 0.75), 1.7);

const GOLDEN = 2.399963;

function addInstance(out: Builder, bp: Blueprint, part: BlueprintPart, index: number) {
  const tpl = templateOf(part.kind);
  const f = surfaceFrame(bp, part.at, part.around);
  const N = f.normal;
  const T = f.tangent;
  const S = new THREE.Vector3().crossVectors(N, T);
  const scale = part.size * partScale(bp);
  const ca = Math.cos(part.angle);
  const sa = Math.sin(part.angle);
  const root = f.position.clone().addScaledVector(N, -0.02 * scale);
  const k = kindIndex(part.kind);
  const phase0 = (index * GOLDEN) % (Math.PI * 2);
  const base = out.count;
  const local = (x: number, y: number, z: number, o: THREE.Vector3) => {
    // Inclinação `angle` em torno do eixo lateral: a ponta vai para a cabeça com angle > 0.
    const yy = y * ca - z * sa;
    const zz = y * sa + z * ca;
    return o.set(0, 0, 0).addScaledVector(S, x).addScaledVector(N, yy).addScaledVector(T, zz);
  };
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const bend = new THREE.Vector3();
  for (let i = 0; i < tpl.count; i++) {
    local(tpl.p[i * 3], tpl.p[i * 3 + 1], tpl.p[i * 3 + 2], p).multiplyScalar(scale).add(root);
    local(tpl.n[i * 3], tpl.n[i * 3 + 1], tpl.n[i * 3 + 2], n).normalize();
    local(tpl.bend[i * 3], tpl.bend[i * 3 + 1], tpl.bend[i * 3 + 2], bend).multiplyScalar(scale);
    out.vert(p, n, tpl.t[i], tpl.lum[i], bend, phase0 + tpl.ph[i]);
    out.kind[out.count - 1] = k;
  }
  for (const i of tpl.idx) out.idx.push(base + i);
  if (!part.mirror) return;
  // Espelho exato em x (o mesmo que usar −around), com a ordem dos triângulos invertida.
  const end = out.count;
  const mbase = end;
  for (let i = base; i < end; i++) {
    p.set(-out.p[i * 3], out.p[i * 3 + 1], out.p[i * 3 + 2]);
    n.set(-out.n[i * 3], out.n[i * 3 + 1], out.n[i * 3 + 2]);
    bend.set(-out.bend[i * 3], out.bend[i * 3 + 1], out.bend[i * 3 + 2]);
    out.vert(p, n, out.t[i], out.lum[i], bend, out.ph[i]);
    out.kind[out.count - 1] = k;
  }
  for (let j = 0; j < tpl.idx.length; j += 3) out.idx.push(mbase + tpl.idx[j], mbase + tpl.idx[j + 2], mbase + tpl.idx[j + 1]);
}

export function buildPartsGeometry(bp: Blueprint): THREE.BufferGeometry {
  const b = new Builder();
  bp.parts.forEach((part, i) => addInstance(b, bp, part, i));
  centerPositions(b.p, centroidOffset(bp));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(b.kind, 1));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(b.t, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(b.ph, 1));
  g.setAttribute('aLum', new THREE.Float32BufferAttribute(b.lum, 1));
  g.setAttribute('aBend', new THREE.Float32BufferAttribute(b.bend, 3));
  g.setIndex(b.idx);
  if (b.count > 0) {
    g.computeBoundingSphere();
    // Folga para o movimento do vertex shader.
    g.boundingSphere!.radius += 0.3;
  } else {
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Cache por planta, com contagem de referências.

export interface CreatureGeometry {
  body: THREE.BufferGeometry;
  parts: THREE.BufferGeometry;
}

const entries = new Map<string, CreatureGeometry & { refs: number }>();

export const geometryCache = {
  acquire(bp: Blueprint): CreatureGeometry {
    const key = JSON.stringify(bp);
    let e = entries.get(key);
    if (!e) {
      e = { body: buildBodyGeometry(bp), parts: buildPartsGeometry(bp), refs: 0 };
      entries.set(key, e);
    }
    e.refs++;
    return { body: e.body, parts: e.parts };
  },
  release(bp: Blueprint): void {
    const key = JSON.stringify(bp);
    const e = entries.get(key);
    if (!e) return;
    e.refs--;
    if (e.refs > 0) return;
    entries.delete(key);
    e.body.dispose();
    e.parts.dispose();
  },
  /** Plantas com geometria viva agora (para depuração e testes). */
  size(): number {
    return entries.size;
  },
};
