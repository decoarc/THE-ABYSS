import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import type { SocketLike } from './services/worldConnection';

const inertChannel = { join: () => ({ receive() { return this; } }), on() {}, leave() {} };
const inertSocket: SocketLike = {
  connect() {}, disconnect() {}, onOpen() {}, onError() {}, onClose() {},
  channel: () => inertChannel,
};

beforeEach(() => window.history.replaceState(null, '', '/'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('sem WebGL mostra fallback e selo', () => {
  render(<App webglAvailable={false} socketFactory={() => inertSocket} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/WebGL/);
  expect(screen.getByText('Demonstração visual — não é um ecossistema real')).toBeInTheDocument();
});

it('botão leva à criação e voltar preserva o rascunho', () => {
  render(<App webglAvailable={false} socketFactory={() => inertSocket} />);
  fireEvent.click(screen.getByRole('button', { name: 'CRIAR ESPÉCIE' }));
  expect(window.location.hash).toBe('#criar');
  expect(screen.getByRole('button', { name: 'Liberar no abismo' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'CRIAR ESPÉCIE' })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Nome da espécie'), { target: { value: 'Lumen' } });
  fireEvent.click(screen.getByRole('button', { name: /Raspador/ }));
  fireEvent.click(screen.getByRole('button', { name: '← Voltar ao abismo' }));
  expect(screen.queryByRole('button', { name: 'Liberar no abismo' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'CRIAR ESPÉCIE' }));
  expect(screen.getByLabelText('Nome da espécie')).toHaveValue('Lumen');
  expect(screen.getByRole('button', { name: /Raspador/ })).toBeDisabled();
});

it('confirmação mostra o aviso e volta ao mundo', async () => {
  const fetch = vi.fn(async () =>
    new Response(JSON.stringify({ status: 'published', species: { id: 'sp1', name: 'Lumen', code: 'LUM-01' } }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetch);
  window.history.replaceState(null, '', '/#confirmar=tok123');
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // StrictMode roda os efeitos duas vezes: a confirmação ainda acontece uma vez só.
  render(<StrictMode><App webglAvailable={false} socketFactory={() => inertSocket} /></StrictMode>);
  expect(await screen.findByText('Lumen foi liberada no abismo. Procure por ela no índice.')).toBeInTheDocument();
  expect(window.location.hash).toBe('');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'CRIAR ESPÉCIE' })).toBeInTheDocument();
  // O setNotice veio de uma promessa (fora do act): deixa o efeito do aviso armar o relógio antes de avançar.
  await act(async () => {});
  act(() => vi.advanceTimersByTime(8100));
  expect(screen.queryByText('Lumen foi liberada no abismo. Procure por ela no índice.')).not.toBeInTheDocument();
});

it('link que não vale mais avisa', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'invalid' }), { status: 200 })));
  window.history.replaceState(null, '', '/#confirmar=velho');
  render(<App webglAvailable={false} socketFactory={() => inertSocket} />);
  expect(await screen.findByText('Este link não vale mais. Monte de novo e peça outro link.')).toBeInTheDocument();
});
