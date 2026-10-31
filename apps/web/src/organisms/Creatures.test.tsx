import { componentFor } from './Creatures';

it('skips unknown species', () => expect(componentFor('lula')).toBeNull());
it('as cinco espécies conhecidas têm componente', () => {
  for (const s of ['membrana', 'filamento', 'casco', 'celula', 'poliedro']) expect(componentFor(s)).toBeTypeOf('function');
});
it('espécies diferentes, componentes diferentes', () => {
  const cs = ['membrana', 'filamento', 'casco', 'celula', 'poliedro'].map(componentFor);
  expect(new Set(cs).size).toBe(5);
});
