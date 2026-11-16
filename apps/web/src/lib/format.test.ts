import { formatAge, formatCause, formatDiet, formatDiff, formatExtinctDate, formatPosition, formatShares } from './format';

it('menos de um minuto', () => expect(formatAge(30_000)).toBe('há menos de 1 min'));
it('minutos', () => expect(formatAge(14 * 60_000)).toBe('há 14 min'));
it('horas e minutos', () => expect(formatAge(125 * 60_000)).toBe('há 2 h 5 min'));
it('posição com uma casa decimal', () => expect(formatPosition([12.44, 3.06, -8])).toBe('12.4 · 3.1 · -8.0'));

const sp = (id: string, name: string) => ({ id, code: id, name, body_radius: 1, diet: { kind: 'flora' as const, prey: [] }, extinct_ms: null, parent: null, root: id, region: null, born_ms: null });
const ALL = [sp('filamento', 'Filamento'), sp('celula', 'Célula'), sp('poliedro', 'Poliedro')];

it('dieta: flora e partículas', () => {
  expect(formatDiet({ kind: 'flora', prey: [] }, ALL)).toBe('flora');
  expect(formatDiet({ kind: 'particles', prey: [] }, ALL)).toBe('partículas');
});
it('predador', () => {
  expect(formatDiet({ kind: 'predator', prey: [] }, ALL)).toBe('criaturas menores');
});
it('dieta: presas pelo nome, com " e "', () => {
  expect(formatDiet({ kind: 'prey', prey: ['filamento', 'celula'] }, ALL)).toBe('Filamento e Célula');
});
it('data de extinção dd/mm hh:mm em hora local', () => {
  expect(formatExtinctDate(new Date(2026, 10, 5, 9, 7).getTime())).toBe('05/11 09:07');
});

it('diferença de peças em ordem alfabética, com sinal de menos U+2212', () => {
  expect(formatDiff({ placa: -1, flagelo: 1 })).toBe('+flagelo −placa');
  expect(formatDiff({ ocelo: 2 })).toBe('+2 ocelo');
  expect(formatDiff({ espinho: -3 })).toBe('−3 espinho');
  expect(formatDiff({})).toBe('');
});

it('causa da morte para as 5 causas', () => {
  expect(formatCause('starvation')).toBe('fome');
  expect(formatCause('old_age')).toBe('velhice');
  expect(formatCause('predation', 'Garra')).toBe('predação por Garra');
  expect(formatCause('predation', null)).toBe('predação');
  expect(formatCause('branched')).toBe('todos passaram para ramos');
  expect(formatCause(null)).toBe('causa não registrada');
});

it('divisão da reta final em porcentagem', () => {
  expect(
    formatShares([
      { cause: 'predation', predator_name: 'Garra', share: 0.5 },
      { cause: 'starvation', predator_name: null, share: 0.3 },
      { cause: 'predation', predator_name: 'Lumina · Floresta', share: 0.2 },
    ]),
  ).toBe('50% predação por Garra, 30% fome, 20% predação por Lumina · Floresta');
});
