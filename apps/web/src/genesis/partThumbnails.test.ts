import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { createPartsMaterial } from './materials';
import { PALETTE } from '../lib/palette';
import { INITIAL_BLUEPRINT } from './blueprint';
import { PART_KINDS } from './geometry';
import { createThumbnailMaterial, renderPartThumbnails, resetPartThumbnailsCache, thumbnailBlueprint, usePartThumbnails } from './partThumbnails';

afterEach(() => vi.restoreAllMocks());

it('thumbnailBlueprint: só a peça pedida, sem espelho, com as cores do menu', () => {
  for (const kind of PART_KINDS) {
    const bp = thumbnailBlueprint(kind);
    expect(bp.parts).toHaveLength(1);
    expect(bp.parts[0].kind).toBe(kind);
    expect(bp.parts[0].mirror).toBe(false);
    expect(bp.colors.glow.toLowerCase()).toBe(PALETTE.cyan.toLowerCase());
    expect(bp.body.spine).toEqual(INITIAL_BLUEPRINT.body.spine);
  }
});

it('renderPartThumbnails devolve null sem WebGL e não lança', () => {
  // jsdom não tem contexto webgl
  expect(() => renderPartThumbnails()).not.toThrow();
  expect(renderPartThumbnails()).toBeNull();
});

it('usePartThumbnails tenta gerar uma vez só por página', () => {
  resetPartThumbnailsCache();
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
  const a = renderHook(() => usePartThumbnails());
  a.unmount();
  const afterFirst = spy.mock.calls.length;
  expect(afterFirst).toBeGreaterThan(0);
  const b = renderHook(() => usePartThumbnails());
  expect(b.result.current).toBeNull();
  // A falha também fica no cache: a segunda montagem não tenta de novo.
  expect(spy.mock.calls.length).toBe(afterFirst);
});

it('material das fotos: mesma geometria animada do jogo, cores do menu', () => {
  const game = createPartsMaterial();
  const thumb = createThumbnailMaterial();
  expect(thumb.vertexShader).toBe(game.vertexShader);
  expect(thumb.fragmentShader).not.toBe(game.fragmentShader);
  expect((thumb.uniforms.uRim.value as THREE.Color).getHexString()).toBe(PALETTE.cyan.slice(1).toLowerCase());
  expect((thumb.uniforms.uFill.value as THREE.Color).getHexString()).toBe(PALETTE.teal.slice(1).toLowerCase());
  expect(thumb.side).toBe(game.side);
});
