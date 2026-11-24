// Fotos das peças para a tela de criação: cada tipo sozinho, com a geometria e o material do jogo,
// sempre nas cores do menu (não as da espécie). Um único renderizador fora da tela gera as 10
// imagens uma vez por página e é descartado; sem WebGL fica `null` e os cartões vão só com texto.
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { PALETTE } from '../lib/palette';
import type { Blueprint, PartKind } from '../services/wire';
import { CATALOG, INITIAL_BLUEPRINT } from './blueprint';
import { PART_KINDS, buildPartsGeometry } from './geometry';
import { applyBlueprint, createPartsMaterial } from './materials';

export type PartThumbnails = Record<PartKind, string>;

const SIZE = 128;
const FOV = 38;
/** Fração do quadro ocupada pela maior dimensão da peça. */
const FILL = 0.8;

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
      const material = createPartsMaterial();
      applyBlueprint(material, bp);
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      // Enquadra pela caixa (a esfera de bounding já vem com folga para o vertex shader).
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const center = box.getCenter(new THREE.Vector3());
      const extent = box.getSize(new THREE.Vector3()).length() || 0.5;
      const dist = extent / 2 / Math.tan((FOV * Math.PI) / 360) / FILL;
      // De lado e um pouco acima.
      camera.position.copy(center).add(new THREE.Vector3(dist * 0.95, dist * 0.32, 0));
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
