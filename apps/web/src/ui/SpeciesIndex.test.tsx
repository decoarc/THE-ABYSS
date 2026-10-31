import { fireEvent, screen } from '@testing-library/react';
import { SpeciesIndex } from './SpeciesIndex';
import { membranas, renderWithWorld } from '../test-utils/world';

it('mostra o total recolhido', () => {
  renderWithWorld(<SpeciesIndex />, { organisms: membranas(45) });
  expect(screen.getByRole('button', { name: /NO TERRÁRIO · 45/ })).toBeInTheDocument();
});

it('abrir lista os ids da espécie e clicar seleciona sem seguir', () => {
  const { selection } = renderWithWorld(<SpeciesIndex />, { organisms: membranas(9) });
  fireEvent.click(screen.getByRole('button', { name: /NO TERRÁRIO/ }));
  fireEvent.click(screen.getByRole('button', { name: /Membrana\s+9/ }));
  expect(screen.getAllByRole('button', { name: /^MBR-\d{4}$/ })).toHaveLength(9);
  fireEvent.click(screen.getByRole('button', { name: 'MBR-0003' }));
  expect(selection.get()).toEqual({ id: 'MBR-0003', following: false });
});

it('o id selecionado leva aria-current', () => {
  renderWithWorld(<SpeciesIndex />, { organisms: membranas(9), selectId: 'MBR-0003' });
  fireEvent.click(screen.getByRole('button', { name: /NO TERRÁRIO/ }));
  fireEvent.click(screen.getByRole('button', { name: /Membrana\s+9/ }));
  expect(screen.getByRole('button', { name: 'MBR-0003' })).toHaveAttribute('aria-current', 'true');
});
