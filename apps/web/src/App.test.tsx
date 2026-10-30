import { render, screen } from '@testing-library/react';
import { App } from './App';

it('sem WebGL mostra fallback e selo', () => {
  render(<App webglAvailable={false} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/WebGL/);
  expect(screen.getByText('Demonstração visual — não é um ecossistema real')).toBeInTheDocument();
});
