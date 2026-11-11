import { INITIAL_BLUEPRINT } from '../genesis/blueprint';
import type { SpeciesInfo } from '../services/wire';
import { Criada } from './Criada';
import { componentFor } from './Creatures';

const TEST = ['membrana', 'filamento', 'casco', 'celula', 'poliedro'];
const info = (id: string, blueprint?: SpeciesInfo['blueprint']): SpeciesInfo => ({
  id,
  code: id.toUpperCase(),
  name: id,
  body_radius: 1,
  diet: { kind: 'flora', prey: [] },
  extinct_ms: null,
  blueprint,
});

it('skips unknown species', () => expect(componentFor(info('lula'))).toBeNull());
it('as cinco espécies conhecidas têm componente', () => {
  for (const s of TEST) expect(componentFor(info(s))).toBeTypeOf('function');
});
it('espécies diferentes, componentes diferentes', () => {
  const cs = TEST.map((s) => componentFor(info(s)));
  expect(new Set(cs).size).toBe(5);
});
it('espécie com blueprint usa Criada', () => {
  expect(componentFor(info('sp1', INITIAL_BLUEPRINT))).toBe(Criada);
  expect(componentFor(info('sp42', INITIAL_BLUEPRINT))).toBe(Criada);
});
it('espécie sem desenho é ignorada', () => {
  expect(componentFor(undefined)).toBeNull();
  expect(componentFor(info('sp7', null))).toBeNull();
  expect(componentFor(info('sp8'))).toBeNull();
});
