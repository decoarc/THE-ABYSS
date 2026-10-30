import { render, screen } from '@testing-library/react';
import { Fallback } from './Fallback';

it('Fallback de erro mostra mensagem legível', () => {
  render(<Fallback reason="error" />);
  expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível/i);
});
