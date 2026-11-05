import * as THREE from 'three';
import type { Sponge } from '../../world/map';

/** Forma de uma esponja: raio e altura do cilindro que ela ocupa. */
export type LatticeShape = Pick<Sponge, 'r' | 'h'>;

/**
 * Perfil do cesto (raio relativo pela altura relativa): base um pouco estreita, barriga larga
 * a ~40% da altura, cintura antes da boca e a boca abrindo de leve. Interpolação por cosseno.
 */
const PROFILE: [number, number][] = [
  [0, 0.74],
  [0.4, 1],
  [0.84, 0.64],
  [1, 0.72],
];

function profile(t: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [t1, v1] = PROFILE[i];
    if (t <= t1) {
      const [t0, v0] = PROFILE[i - 1];
      const k = (1 - Math.cos(((t - t0) / (t1 - t0)) * Math.PI)) / 2;
      return v0 + (v1 - v0) * k;
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}

/** Volta de cada fio helicoidal do pé à boca (rad): os dois sentidos se cruzam em losangos. */
const TWIST = Math.PI * 0.85;

/** Espessura do fio de vidro. */
const tubeRadius = (r: number) => 0.035 + 0.015 * r;

/**
 * Cesto de treliça (Euplectella): fios helicoidais nos dois sentidos mais alguns anéis, cada fio um
 * tubo fino. Coordenadas locais: base no centro da origem, `y` de 0 a `h`. A casca externa (centro do
 * fio + espessura) cabe no cilindro `r × h`. `detail` (0–1] escala quantos fios e quantas amostras.
 * Atributo `aHeight`: altura relativa 0–1, para o brilho preso dentro.
 */
export function latticeGeometry(shape: LatticeShape, detail: number): THREE.BufferGeometry {
  const { r, h } = shape;
  const tube = tubeRadius(r);
  // Barriga do perfil (1) + espessura = r: nenhum ponto passa da parede (com folga para o float32).
  const EPS = 1e-3;
  const shell = r - tube - EPS;
  const y0 = tube + EPS;
  const y1 = h - tube - EPS;
  const sides = detail >= 0.8 ? 4 : 3;
  const strands = Math.max(4, Math.round((5 + 3 * r) * detail));
  const samples = Math.max(8, Math.round((10 + 4 * h) * detail));
  const rings = Math.max(2, Math.round((h / 1.2) * detail));
  const ringSamples = Math.max(12, Math.round(((2 * Math.PI * shell) / 0.22) * detail));

  const positions: number[] = [];
  const normals: number[] = [];
  const heights: number[] = [];
  const indices: number[] = [];

  const c = new THREE.Vector3();
  const next = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const binormal = new THREE.Vector3();
  const n = new THREE.Vector3();

  /** Um tubo pela curva `at(s)`, s em 0..1, com `count` amostras; `closed` para anéis. */
  const addTube = (at: (s: number, out: THREE.Vector3) => THREE.Vector3, count: number, closed: boolean) => {
    const start = positions.length / 3;
    const steps = closed ? count : count - 1;
    for (let k = 0; k < count; k++) {
      const s = k / steps;
      at(s, c);
      at(closed ? (k + 1) / steps : Math.min(1, s + 1 / steps), next);
      at(closed ? (k - 1) / steps : Math.max(0, s - 1 / steps), prev);
      tangent.subVectors(next, prev).normalize();
      // Normal do quadro: a direção horizontal para fora; o binormal fecha o quadro.
      radial.set(c.x, 0, c.z).normalize();
      binormal.crossVectors(tangent, radial).normalize();
      radial.crossVectors(binormal, tangent).normalize();
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * Math.PI * 2;
        n.copy(radial).multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
        positions.push(c.x + n.x * tube, c.y + n.y * tube, c.z + n.z * tube);
        normals.push(n.x, n.y, n.z);
        heights.push(c.y / h);
      }
    }
    const segs = closed ? count : count - 1;
    for (let k = 0; k < segs; k++) {
      const a0 = start + k * sides;
      const b0 = start + ((k + 1) % count) * sides;
      for (let j = 0; j < sides; j++) {
        const j1 = (j + 1) % sides;
        indices.push(a0 + j, b0 + j, a0 + j1, a0 + j1, b0 + j, b0 + j1);
      }
    }
  };

  // Ponto da casca na altura relativa t e ângulo a. O centro do fio fica dentro de `shell`, e a
  // espessura só soma `tube` ao raio: |centro| + tube ≤ r.
  const onShell = (t: number, a: number, out: THREE.Vector3) => {
    const rho = shell * profile(t);
    return out.set(Math.cos(a) * rho, y0 + (y1 - y0) * t, Math.sin(a) * rho);
  };

  for (const dir of [1, -1])
    for (let i = 0; i < strands; i++) {
      // Os dois sentidos defasados de meio passo: os cruzamentos não caem todos na mesma altura.
      const a0 = ((i + (dir < 0 ? 0.5 : 0)) / strands) * Math.PI * 2;
      addTube((s, out) => onShell(s, a0 + dir * TWIST * s, out), samples, false);
    }

  // Anéis: um perto do pé, os do meio e a borda da boca.
  for (let k = 0; k <= rings; k++) {
    const t = k / rings;
    addTube((s, out) => onShell(t, s * Math.PI * 2, out), ringSamples, true);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('aHeight', new THREE.Float32BufferAttribute(heights, 1));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

/**
 * Esponjas instanciadas por tamanho: um cesto por balde, gerado no raio máximo do balde e
 * encolhido por instância (nunca esticado além de `r`). A altura nominal é ajustada por instância.
 */
export const SPONGE_BUCKETS: readonly LatticeShape[] = [
  { r: 1.25, h: 3.5 },
  { r: 1.7, h: 4.5 },
  { r: 2.2, h: 5.5 },
];

export function bucketOf(sp: LatticeShape): number {
  for (let i = 0; i < SPONGE_BUCKETS.length; i++) if (sp.r <= SPONGE_BUCKETS[i].r) return i;
  return SPONGE_BUCKETS.length - 1;
}

/** Quanto a base afunda no leito, para o pé não flutuar no relevo. */
export const SPONGE_SINK = 0.25;

/**
 * Instância de uma esponja no mundo: base assentada (um pouco abaixo de `floorY`) e topo
 * exatamente em `y = h`, o cilindro `y < h, dist < r` que o servidor usa (sim.ex, `in_sponge?`).
 */
export function placeSponge(sp: Sponge, floorY: number): { bucket: number; baseY: number; scaleXZ: number; scaleY: number } {
  const bucket = bucketOf(sp);
  const b = SPONGE_BUCKETS[bucket];
  const baseY = floorY - SPONGE_SINK;
  return { bucket, baseY, scaleXZ: sp.r / b.r, scaleY: (sp.h - baseY) / b.h };
}
