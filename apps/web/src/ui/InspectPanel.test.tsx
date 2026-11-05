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

it('mostra fase, energia, geração, dieta e pai, nesta ordem', () => {
  const orgs = [
    { ...membranas(1)[0]!, id: 'MBR-0001' },
    { ...membranas(1)[0]!, id: 'MBR-0002', stage: 'juvenile' as const, e: 0.456, gen: 3, parent: 'MBR-0001' },
  ];
  const { container } = renderWithWorld(<InspectPanel />, { organisms: orgs, selectId: 'MBR-0002' });
  const labels = Array.from(container.querySelectorAll('aside span')).map((s) => s.textContent);
  const order = ['ESPÉCIE', 'FASE', 'ENERGIA', 'GERAÇÃO', 'COME', 'NASCEU DE', 'SURGIU', 'POSIÇÃO'];
  expect(labels.filter((t) => order.includes(t ?? ''))).toEqual(order);
  const val = (l: string) => screen.getByText(l).nextElementSibling?.textContent;
  expect(val('FASE')).toBe('jovem');
  expect(val('ENERGIA')).toBe('46%');
  expect(val('GERAÇÃO')).toBe('3');
  expect(val('COME')).toBe('partículas');
  expect(val('NASCEU DE')).toBe('MBR-0001');
});

it('fundador adulto: fase adulto e nasceu de —', () => {
  renderWithWorld(<InspectPanel />, { organisms: membranas(1), selectId: 'MBR-0001' });
  expect(screen.getByText('FASE').nextElementSibling?.textContent).toBe('adulto');
  expect(screen.getByText('ENERGIA').nextElementSibling?.textContent).toBe('80%');
  expect(screen.getByText('NASCEU DE').nextElementSibling?.textContent).toBe('—');
});
