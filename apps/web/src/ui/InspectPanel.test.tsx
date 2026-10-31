import { fireEvent, screen } from '@testing-library/react';
import { InspectPanel } from './InspectPanel';
import { membranas, renderWithWorld } from '../test-utils/world';

it('sem seleção não renderiza nada', () => {
  const { container } = renderWithWorld(<InspectPanel />, { organisms: membranas(3) });
  expect(container).toBeEmptyDOMElement();
});

it('mostra indivíduo e espécie', () => {
  renderWithWorld(<InspectPanel />, { organisms: membranas(42), selectId: 'MBR-0042' });
  expect(screen.getByText('INDIVÍDUO · MBR-0042')).toBeInTheDocument();
  expect(screen.getByText('Membrana')).toBeInTheDocument();
});

it('seguir liga following e troca o rótulo', () => {
  const { selection } = renderWithWorld(<InspectPanel />, { organisms: membranas(42), selectId: 'MBR-0042' });
  fireEvent.click(screen.getByRole('button', { name: 'SEGUIR' }));
  expect(selection.get().following).toBe(true);
  expect(screen.getByRole('button', { name: 'DEIXAR DE SEGUIR' })).toBeInTheDocument();
});

it('fechar limpa a seleção', () => {
  const { selection } = renderWithWorld(<InspectPanel />, { organisms: membranas(42), selectId: 'MBR-0042' });
  fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
  expect(selection.get()).toEqual({ id: null, following: false });
});
