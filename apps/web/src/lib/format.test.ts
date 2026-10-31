import { formatAge, formatPosition } from './format';

it('menos de um minuto', () => expect(formatAge(30_000)).toBe('há menos de 1 min'));
it('minutos', () => expect(formatAge(14 * 60_000)).toBe('há 14 min'));
it('horas e minutos', () => expect(formatAge(125 * 60_000)).toBe('há 2 h 5 min'));
it('posição com uma casa decimal', () => expect(formatPosition([12.44, 3.06, -8])).toBe('12.4 · 3.1 · -8.0'));
