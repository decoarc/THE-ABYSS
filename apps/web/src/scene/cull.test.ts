import { CULL_DISTANCE, isCulled } from './cull';

const cam = { x: 3, y: 4, z: -2 };

it('CULL_DISTANCE é 55', () => expect(CULL_DISTANCE).toBe(55));
it('a 54 continua visível', () => expect(isCulled(cam, { x: 3 + 54, y: 4, z: -2 })).toBe(false));
it('a 56 é descartado', () => expect(isCulled(cam, { x: 3, y: 4, z: -2 - 56 })).toBe(true));
it('conta a distância em 3D', () => expect(isCulled(cam, { x: 3 + 40, y: 4 + 40, z: -2 })).toBe(true));
