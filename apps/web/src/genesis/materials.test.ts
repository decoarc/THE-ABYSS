import type { Blueprint } from '../services/wire';
import { INITIAL_BLUEPRINT } from './blueprint';
import { applyBlueprint, createBodyMaterial, createPartsMaterial } from './materials';

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
  for (const u of ['uTime', 'uSwim', 'uGlow', 'uSkin', 'uFade']) expect(parts.uniforms[u], u).toBeDefined();
  applyBlueprint(body, { ...a, pattern: 'aneis' });
  expect(body.uniforms.uPattern.value).toBe(3);
});
