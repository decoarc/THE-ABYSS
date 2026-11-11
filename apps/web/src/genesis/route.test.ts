import { act, renderHook } from '@testing-library/react';
import { navigate, parseRoute, useRoute } from './route';

it('as três rotas', () => {
  expect(parseRoute('')).toEqual({ kind: 'world' });
  expect(parseRoute('#')).toEqual({ kind: 'world' });
  expect(parseRoute('#criar')).toEqual({ kind: 'create' });
  expect(parseRoute('#confirmar=abc_DEF-123')).toEqual({ kind: 'confirm', token: 'abc_DEF-123' });
});

it('hash estranho é o mundo', () => {
  expect(parseRoute('#qualquer')).toEqual({ kind: 'world' });
  expect(parseRoute('#confirmar=')).toEqual({ kind: 'world' });
  expect(parseRoute('#criar/mais')).toEqual({ kind: 'world' });
});

it('useRoute acompanha a navegação', () => {
  window.history.replaceState(null, '', '/');
  const { result } = renderHook(() => useRoute());
  expect(result.current).toEqual({ kind: 'world' });
  act(() => navigate('#criar'));
  expect(result.current).toEqual({ kind: 'create' });
  act(() => navigate('', { replace: true }));
  expect(result.current).toEqual({ kind: 'world' });
  expect(window.location.hash).toBe('');
});
