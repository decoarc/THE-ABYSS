import { render, screen } from '@testing-library/react';
import { App } from './App';
import type { SocketLike } from './services/worldConnection';

const inertChannel = { join: () => ({ receive() { return this; } }), on() {}, leave() {} };
const inertSocket: SocketLike = {
  connect() {}, disconnect() {}, onOpen() {}, onError() {}, onClose() {},
  channel: () => inertChannel,
};

it('sem WebGL mostra fallback e selo', () => {
  render(<App webglAvailable={false} socketFactory={() => inertSocket} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/WebGL/);
  expect(screen.getByText('Demonstração visual — não é um ecossistema real')).toBeInTheDocument();
});
