// Fotos das peças para a tela de criação: cada tipo sozinho, com a geometria e o material do jogo,
// sempre nas cores do menu (não as da espécie). Um único renderizador fora da tela gera as 10
// imagens uma vez por página e é descartado; sem WebGL fica `null` e os cartões vão só com texto.
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../lib/palette';
import type { Blueprint, PartKind } from '../services/wire';
import { CATALOG, INITIAL_BLUEPRINT } from './blueprint';
import { PART_KINDS, buildPartsGeometry } from './geometry';
import { createPartsMaterial } from './materials';

export type PartThumbnails = Record<PartKind, string>;

const SIZE = 128;
const FOV = 38;
/** Fração do quadro ocupada pela maior dimensão da peça. */
const FILL = 0.8;

// No jogo as peças são escuras de propósito (lidas contra o corpo que brilha); sozinhas no painel
// sumiriam. A foto usa o mesmo vertex shader (mesma forma) com um preenchimento teal e borda ciano.
const thumbFragment = /* glsl */ `
uniform vec3 uFill;
uniform vec3 uRim;
varying float vT;
varying float vLum;
varying vec3 vNormalV;
varying vec3 vViewDir;
void main() {
  float facing = abs(dot(normalize(vNormalV), normalize(vViewDir)));
  float rim = pow(1.0 - facing, 1.5);
  vec3 col = mix(uFill * (0.8 + 0.4 * facing), uRim, rim * 0.85);
  col = mix(col, uRim * 1.4, vLum);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createThumbnailMaterial(): THREE.ShaderMaterial {
  const game = createPartsMaterial();
  const m = new THREE.ShaderMaterial({
    vertexShader: game.vertexShader,
    fragmentShader: thumbFragment,
    side: game.side,
    uniforms: {
      uTime: { value: 0 },
      uBeat: { value: new THREE.Vector3() },
      uFill: { value: new THREE.Color(PALETTE.teal) },
      uRim: { value: new THREE.Color(PALETTE.cyan) },
    },
  });
  game.dispose();
  return m;
}

export function thumbnailBlueprint(kind: PartKind): Blueprint {
  const [smin, smax] = CATALOG.part_size;
  return {
    ...INITIAL_BLUEPRINT,
    parts: [{ kind, at: 0.5, around: 0, size: (smin + smax) / 2, angle: 0, mirror: false }],
    colors: { glow: PALETTE.cyan, body: PALETTE.teal },
    pattern: 'liso',
  };
}

export function renderPartThumbnails(): PartThumbnails | null {
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
    const out = {} as PartThumbnails;
    for (const kind of PART_KINDS) {
      const bp = thumbnailBlueprint(kind);
      const geometry = buildPartsGeometry(bp);
      const material = createThumbnailMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      // Enquadra pela caixa (a esfera de bounding já vem com folga para o vertex shader).
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const center = box.getCenter(new THREE.Vector3());
      // A câmera olha de lado (eixo x): o que aparece é sobretudo y e z.
      const s = box.getSize(new THREE.Vector3());
      const extent = Math.max(s.y, s.z, s.x * 0.5) || 0.5;
      const dist = extent / 2 / Math.tan((FOV * Math.PI) / 360) / FILL;
      // De lado e um pouco acima.
      // A placa fica deitada sobre o corpo: de lado vira um traço, então ela é vista mais de cima.
      const dir = kind === 'placa' ? new THREE.Vector3(0.45, 0.85, 0.28) : new THREE.Vector3(0.95, 0.32, 0);
      camera.position.copy(center).addScaledVector(dir.normalize(), dist);
      camera.lookAt(center);
      renderer.clear();
      renderer.render(scene, camera);
      out[kind] = canvas.toDataURL('image/png');
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    }
    return out;
  } catch {
    return null;
  } finally {
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
  }
}

/** `undefined` = ainda não tentou nesta página. */
let cache: PartThumbnails | null | undefined;

export function resetPartThumbnailsCache(): void {
  cache = undefined;
}

export function usePartThumbnails(): PartThumbnails | null {
  const [thumbs, setThumbs] = useState<PartThumbnails | null>(cache ?? null);
  useEffect(() => {
    if (cache === undefined) cache = renderPartThumbnails();
    setThumbs(cache);
  }, []);
  return thumbs;
}
