import { screen } from '@testing-library/react';
import { ConnectionNotice } from './ConnectionNotice';
import { renderWithWorld } from '../test-utils/world';

it('aparece enquanto conecta', () => {
  renderWithWorld(<ConnectionNotice />);
  expect(screen.getByRole('status')).toHaveTextContent('conectando…');
});

it('some quando ao vivo', () => {
  renderWithWorld(<ConnectionNotice />, { live: true });
  expect(screen.queryByRole('status')).toBeNull();
});
