import { act, fireEvent, screen } from '@testing-library/react';
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

it('mundo vazio: contagem 0 e sem grupos', () => {
  renderWithWorld(<SpeciesIndex />, { organisms: [] });
  fireEvent.click(screen.getByRole('button', { name: /NO TERRÁRIO · 0/ }));
  expect(screen.getAllByRole('button')).toHaveLength(1);
});

it('espécie extinta continua listada com a data, sem indivíduos nem expansão', () => {
  const ms = new Date(2026, 10, 5, 9, 7).getTime();
  const { store } = renderWithWorld(<SpeciesIndex />, { organisms: membranas(2) });
  act(() => {
    store.applyTick(
      { world_id: 'w1', tick: 2, server_ms: 1_000_100, o: [[0, 0, 0, 0, 0, 0, 0.8, 0], [0, 0, 0, 0, 0, 0, 0.8, 0]], b: [], d: [], x: [['celula', ms]], f: [], ps: [], pr: [] },
      1_000_100,
    );
  });
  fireEvent.click(screen.getByRole('button', { name: /NO TERRÁRIO · 2/ }));
  const extinta = screen.getByRole('button', { name: /Célula/ });
  expect(extinta).toHaveTextContent('extinta · 05/11 09:07');
  fireEvent.click(extinta);
  expect(screen.queryAllByRole('button', { name: /^MBR-/ })).toHaveLength(0);
});

it('fantasma some do índice e não conta em NO TERRÁRIO', () => {
  const { store } = renderWithWorld(<SpeciesIndex />, { organisms: membranas(3) });
  act(() => {
    store.applyTick(
      { world_id: 'w1', tick: 2, server_ms: 1_000_100, o: [[0, 0, 0, 0, 0, 0, 0.8, 0], [0, 0, 0, 0, 0, 0, 0.8, 0]], b: [], d: [['MBR-0002', 'starvation']], x: [], f: [], ps: [], pr: [] },
      1_000_100,
    );
  });
  fireEvent.click(screen.getByRole('button', { name: /NO TERRÁRIO · 2/ }));
  fireEvent.click(screen.getByRole('button', { name: /Membrana\s+2/ }));
  expect(screen.queryByRole('button', { name: 'MBR-0002' })).toBeNull();
  expect(screen.getAllByRole('button', { name: /^MBR-/ })).toHaveLength(2);
});
