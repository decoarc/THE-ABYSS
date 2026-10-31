import { createSelection } from './selection';

it('select zera following', () => {
  const s = createSelection();
  s.select('a');
  s.setFollowing(true);
  expect(s.get()).toEqual({ id: 'a', following: true });
  s.select('b');
  expect(s.get()).toEqual({ id: 'b', following: false });
});

it('setFollowing sem id é ignorado', () => {
  const s = createSelection();
  const fn = vi.fn();
  s.subscribe(fn);
  s.setFollowing(true);
  expect(s.get()).toEqual({ id: null, following: false });
  expect(fn).not.toHaveBeenCalled();
});

it('clear limpa tudo', () => {
  const s = createSelection();
  s.select('a');
  s.setFollowing(true);
  s.clear();
  expect(s.get()).toEqual({ id: null, following: false });
});

it('get é estável entre mudanças', () => {
  const s = createSelection();
  s.select('a');
  expect(s.get()).toBe(s.get());
});
