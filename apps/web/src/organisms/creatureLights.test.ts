import { Color } from 'three';
import { createLightPool, type LightSlot } from './creatureLights';

const color = new Color('#ffaa00');
const slots = (n: number): LightSlot[] =>
  Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, intensity: -1, color: null }));

it('sempre preenche todas as luzes da reserva, com qualquer número de pedidos', () => {
  // O número de luzes da cena não pode variar: cada contagem nova recompila os shaders iluminados.
  for (const n of [0, 1, 4, 30]) {
    const pool = createLightPool();
    for (let i = 0; i < n; i++) pool.request(color, i, 0, 0, 1);
    const out = slots(4);
    pool.assign([0, 0, 0], out);
    expect(out.filter((s) => s.intensity > 0)).toHaveLength(Math.min(n, 4));
    expect(out.every((s) => s.intensity >= 0)).toBe(true);
  }
});

it('as luzes vão para os pedidos mais próximos do alvo', () => {
  const pool = createLightPool();
  for (const x of [20, 3, -1, 9, 40, 2]) pool.request(color, x, 0, 0, 1);
  const out = slots(3);
  pool.assign([0, 0, 0], out);
  expect(out.map((s) => s.x)).toEqual([-1, 2, 3]);
});

it('luz sem pedido fica apagada', () => {
  const pool = createLightPool();
  pool.request(color, 1, 2, 3, 0.8);
  const out = slots(2);
  pool.assign([0, 0, 0], out);
  expect(out[0]).toMatchObject({ x: 1, y: 2, z: 3, intensity: 0.8, color });
  expect(out[1].intensity).toBe(0);
});

it('cada quadro começa sem pedidos', () => {
  const pool = createLightPool();
  pool.request(color, 1, 0, 0, 1);
  const out = slots(1);
  pool.assign([0, 0, 0], out);
  pool.assign([0, 0, 0], out);
  expect(out[0].intensity).toBe(0);
});
