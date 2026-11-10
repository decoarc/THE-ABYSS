import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CreationScreen, initialDraft, type Draft } from './CreationScreen';

const NoPreview = () => <div data-testid="preview" />;

function Harness({ start = initialDraft, onBack = () => {} }: { start?: Draft; onBack?: () => void }) {
  const [draft, setDraft] = useState(start);
  return <CreationScreen draft={draft} onDraftChange={setDraft} onBack={onBack} Preview={NoPreview} />;
}

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

afterEach(() => vi.unstubAllGlobals());

function fillForm() {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'teste@exemplo.dev' } });
  fireEvent.change(screen.getByLabelText('Nome da espécie'), { target: { value: 'Lumen' } });
}

it('Liberar desabilitado sem boca', () => {
  render(<Harness />);
  fillForm();
  expect(screen.getByRole('button', { name: 'Liberar no abismo' })).toBeDisabled();
  expect(screen.getByText('precisa de exatamente uma boca')).toBeInTheDocument();
  expect(screen.getByText(/usados de 24/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Boca-filtro/ }));
  expect(screen.getByRole('button', { name: 'Liberar no abismo' })).toBeEnabled();
  expect(screen.queryByText('precisa de exatamente uma boca')).not.toBeInTheDocument();
  // Com uma boca, as outras ficam desabilitadas.
  expect(screen.getByRole('button', { name: /Mandíbula/ })).toBeDisabled();
});

it('envio mostra a mensagem do link', async () => {
  const fetch = reply(202, { status: 'sent' });
  vi.stubGlobal('fetch', fetch);
  render(<Harness />);
  fillForm();
  fireEvent.click(screen.getByRole('button', { name: /Raspador/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Liberar no abismo' }));
  expect(await screen.findByText('Enviamos um link para o seu e-mail. Ele vale por 30 minutos.')).toBeInTheDocument();
  const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(body.name).toBe('Lumen');
  expect(body.blueprint.parts).toHaveLength(1);
});

it('muitas tentativas pede para esperar', async () => {
  vi.stubGlobal('fetch', reply(429, { status: 'slow_down' }));
  render(<Harness />);
  fillForm();
  fireEvent.click(screen.getByRole('button', { name: /Raspador/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Liberar no abismo' }));
  expect(await screen.findByText('Muitas tentativas. Espere alguns minutos e tente de novo.')).toBeInTheDocument();
});

it('erros do servidor aparecem no campo', async () => {
  vi.stubGlobal('fetch', reply(422, { status: 'invalid', errors: { email: ['e-mail inválido'], name: ['nome deve ter de 2 a 32 caracteres'] } }));
  render(<Harness />);
  fillForm();
  fireEvent.click(screen.getByRole('button', { name: /Raspador/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Liberar no abismo' }));
  await screen.findByText('e-mail inválido');
  expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription('e-mail inválido');
  expect(screen.getByLabelText('Nome da espécie')).toHaveAccessibleDescription('nome deve ter de 2 a 32 caracteres');
  expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
});

it('voltar chama onBack', () => {
  const onBack = vi.fn();
  render(<Harness onBack={onBack} />);
  fireEvent.click(screen.getByRole('button', { name: '← Voltar ao abismo' }));
  expect(onBack).toHaveBeenCalled();
});

it('seleção de peça mostra os controles dela', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: /Aleta/ }));
  expect(screen.getByLabelText('Tamanho')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Espelhar dos dois lados' }));
  expect(screen.getByRole('checkbox', { name: 'Espelhar dos dois lados' })).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Remover peça' }));
  expect(screen.queryByLabelText('Tamanho')).not.toBeInTheDocument();
});
