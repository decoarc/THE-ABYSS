import { createFlyInput } from './flyInput';

let input: ReturnType<typeof createFlyInput>;

beforeEach(() => {
  input = createFlyInput(window);
});

afterEach(() => {
  input.dispose();
  document.body.innerHTML = '';
});

function key(type: 'keydown' | 'keyup', code: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

it('W e D → frente e direita', () => {
  key('keydown', 'KeyW');
  key('keydown', 'KeyD');
  expect(input.read()).toEqual({ forward: 1, right: 1, up: 0 });
  key('keyup', 'KeyW');
  key('keydown', 'KeyA');
  expect(input.read()).toEqual({ forward: 0, right: 0, up: 0 });
});

it('Espaço sobe e Shift desce', () => {
  key('keydown', 'Space');
  expect(input.read().up).toBe(1);
  key('keydown', 'ShiftLeft');
  expect(input.read().up).toBe(0);
  key('keyup', 'Space');
  expect(input.read().up).toBe(-1);
});

it('ignora input/textarea/contenteditable', () => {
  for (const html of ['<input />', '<textarea></textarea>', '<div contenteditable="true"><span>x</span></div>']) {
    document.body.innerHTML = html;
    const el = document.body.querySelector('span') ?? document.body.firstElementChild!;
    key('keydown', 'KeyW', el);
    key('keydown', 'Space', el);
    expect(input.read()).toEqual({ forward: 0, right: 0, up: 0 });
  }
});

it('Espaço com botão focado não sobe', () => {
  document.body.innerHTML = '<button type="button">Seguir</button>';
  const button = document.body.querySelector('button')!;
  const event = key('keydown', 'Space', button);
  expect(input.read().up).toBe(0);
  expect(event.defaultPrevented).toBe(false); // o botão continua recebendo o Espaço
  key('keydown', 'KeyW', button); // as letras ainda nadam
  expect(input.read().forward).toBe(1);
});

it('atalhos com Ctrl/Alt/Meta não nadam', () => {
  key('keydown', 'KeyD', document.body, { ctrlKey: true });
  expect(input.read().right).toBe(0);
});

it('blur solta as teclas', () => {
  key('keydown', 'KeyW');
  key('keydown', 'Space');
  window.dispatchEvent(new Event('blur'));
  expect(input.read()).toEqual({ forward: 0, right: 0, up: 0 });
});

it('dispose para de ouvir', () => {
  input.dispose();
  key('keydown', 'KeyW');
  expect(input.read().forward).toBe(0);
});
