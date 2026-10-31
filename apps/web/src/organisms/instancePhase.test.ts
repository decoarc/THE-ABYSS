import { phaseOf } from './instancePhase';

it('é estável para o mesmo id', () => expect(phaseOf('MBR-0001')).toBe(phaseOf('MBR-0001')));
it('fica em [0, 1)', () => {
  for (let i = 0; i < 500; i++) {
    const p = phaseOf(`FIL-${String(i).padStart(4, '0')}`);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
  }
});
it('ids diferentes dão fases diferentes', () => expect(phaseOf('MBR-0001')).not.toBe(phaseOf('MBR-0002')));
