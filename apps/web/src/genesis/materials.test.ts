import * as THREE from 'three';
import type { Blueprint } from '../services/wire';
import { INITIAL_BLUEPRINT } from './blueprint';
import { advanceBeat, applyBlueprint, createBodyMaterial, createPartsMaterial } from './materials';

const a: Blueprint = INITIAL_BLUEPRINT;
const b: Blueprint = {
  v: 1,
  body: { spine: [[-1, 0.2, 0.3], [0, -0.3, 0.8], [0.6, 0, 0.5], [1.2, 0.4, 0.2]] },
  parts: [
    { kind: 'mandibula', at: 1, around: 0, size: 1.2, angle: 0, mirror: false },
    { kind: 'ocelo', at: 0.8, around: 0.9, size: 0.7, angle: 0, mirror: true },
    { kind: 'flagelo', at: 0, around: 0, size: 1.5, angle: -0.4, mirror: false },
  ],
  colors: { glow: '#ff8844', body: '#221133' },
  pattern: 'listras',
};

it('mesmo programa para qualquer planta', () => {
  for (const create of [createBodyMaterial, createPartsMaterial]) {
    const m1 = create();
    const m2 = create();
    applyBlueprint(m1, a);
    applyBlueprint(m2, b);
    expect(m2.vertexShader).toBe(m1.vertexShader);
    expect(m2.fragmentShader).toBe(m1.fragmentShader);
    expect(m2.defines).toEqual(m1.defines);
    expect(m2.customProgramCacheKey()).toBe(m1.customProgramCacheKey());
    for (const k of ['transparent', 'depthWrite', 'side', 'blending', 'fog'] as const) expect(m2[k]).toBe(m1[k]);
    // As plantas mudam só os valores dos uniforms.
    expect(m2.uniforms.uSkin.value.equals(m1.uniforms.uSkin.value)).toBe(false);
  }
});

it('uniforms pedidos', () => {
  const body = createBodyMaterial();
  for (const u of ['uSkin', 'uGlow', 'uPattern', 'uPulse', 'uFade']) expect(body.uniforms[u], u).toBeDefined();
  const parts = createPartsMaterial();
  for (const u of ['uTime', 'uBeat', 'uGlow', 'uSkin', 'uFade']) expect(parts.uniforms[u], u).toBeDefined();
  applyBlueprint(body, { ...a, pattern: 'aneis' });
  expect(body.uniforms.uPattern.value).toBe(3);
});

it('batida de flagelo, cílios e aleta: o passo de fase não depende do tempo acumulado', () => {
  // Fase = ∫ frequência dt. Com `uTime * f(nado)` no shader, uma variação de nado depois de
  // centenas de segundos virava um salto de dezenas de radianos num quadro: batida frenética.
  const dt = 1 / 60;
  const early = new THREE.Vector3();
  const late = new THREE.Vector3(1e6, 1e6, 1e6);
  advanceBeat(early, dt, 0);
  advanceBeat(late, dt, 0);
  const before = late.clone();
  advanceBeat(late, dt, 1);
  const TAU = Math.PI * 2;
  const wrap = (d: number) => ((d % TAU) + TAU) % TAU;
  const step = new THREE.Vector3(wrap(late.x - before.x), wrap(late.y - before.y), wrap(late.z - before.z));
  // Guardada em [0, 2π): o shader trabalha em float32.
  for (const v of [late.x, late.y, late.z]) expect(v >= 0 && v < TAU).toBe(true);
  // Nadando a toda: flagelo 3.5 + 8, cílios 4 + 5, aleta 1.5 + 2.5 (rad/s).
  expect(step.x).toBeCloseTo(dt * 11.5, 6);
  expect(step.y).toBeCloseTo(dt * 9, 6);
  expect(step.z).toBeCloseTo(dt * 4, 6);
  expect(early.x).toBeCloseTo(dt * 3.5, 6);
  const parts = createPartsMaterial();
  expect(parts.uniforms.uBeat, 'uBeat').toBeDefined();
  expect(parts.vertexShader).not.toMatch(/uTime \* \([^)]*uSwim/);
});
