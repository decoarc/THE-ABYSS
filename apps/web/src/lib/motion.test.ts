import { clampDelta, motionScale } from './motion';

it('clampDelta corta aba em segundo plano', () => expect(clampDelta(12)).toBe(0.05));
it('clampDelta não aceita negativo', () => expect(clampDelta(-1)).toBe(0));
it('clampDelta preserva frame normal', () => expect(clampDelta(0.016)).toBe(0.016));
it('motionScale reduzido', () => expect(motionScale(true)).toBe(0.08));
