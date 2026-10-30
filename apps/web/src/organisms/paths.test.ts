import { CASCO, CELULA, FILAMENTO, MEMBRANA, POLIEDRO } from './creatureConfig';
import { lissajousPath } from './paths';

const LP = { ax: 6, ay: 1.5, az: 4, fx: 0.07, fy: 0.13, fz: 0.05, center: [1, 3, -2] as [number, number, number] };

it('caminho limitado pela amplitude', () => {
  for (let t = 0; t < 100; t += 0.1) {
    const [x, y, z] = lissajousPath(t, LP);
    expect(Math.abs(x - LP.center[0])).toBeLessThanOrEqual(LP.ax);
    expect(Math.abs(y - LP.center[1])).toBeLessThanOrEqual(LP.ay);
    expect(Math.abs(z - LP.center[2])).toBeLessThanOrEqual(LP.az);
  }
});
it('caminho se move de fato', () => expect(lissajousPath(0, LP)).not.toEqual(lissajousPath(5, LP)));
it('Filamento fica acima do leito', () => {
  const p = FILAMENTO.path;
  expect(p.center[1] - p.ay).toBeGreaterThan(0.5);
});
it('núcleos das cinco criaturas distintos', () => {
  const ns = [MEMBRANA, FILAMENTO, CASCO, CELULA, POLIEDRO].map((c) => `${c.nucleus.color}@${c.nucleus.pulseHz}`);
  expect(new Set(ns).size).toBe(5);
});
it('Poliedro maior que o Casco', () => expect(POLIEDRO.radius).toBeGreaterThan(CASCO.radius));
it('Poliedro acima do leito', () => expect(POLIEDRO.position[1] - POLIEDRO.radius - POLIEDRO.bob).toBeGreaterThan(1));
