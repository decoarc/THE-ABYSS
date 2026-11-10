import { INITIAL_BLUEPRINT } from './blueprint';
import { API_URL, confirmSpecies, submitSpecies } from './genesisApi';

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

afterEach(() => vi.unstubAllGlobals());

const form = { email: 'a@b.dev', name: 'Lumen', blueprint: INITIAL_BLUEPRINT };

it('envio: 202 é sent e manda o corpo certo', async () => {
  const fetch = reply(202, { status: 'sent' });
  vi.stubGlobal('fetch', fetch);
  await expect(submitSpecies(form)).resolves.toBe('sent');
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(`${API_URL}/api/genesis/submit`);
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body as string)).toEqual(form);
});

it('envio: 422 traz os erros por campo', async () => {
  vi.stubGlobal('fetch', reply(422, { status: 'invalid', errors: { name: ['nome deve ter de 2 a 32 caracteres'] } }));
  await expect(submitSpecies(form)).resolves.toEqual({ errors: { name: ['nome deve ter de 2 a 32 caracteres'] } });
});

it('envio: 429 é slow_down', async () => {
  vi.stubGlobal('fetch', reply(429, { status: 'slow_down' }));
  await expect(submitSpecies(form)).resolves.toBe('slow_down');
});

it('envio: outra resposta é erro', async () => {
  vi.stubGlobal('fetch', reply(500, {}));
  await expect(submitSpecies(form)).rejects.toThrow();
});

it('confirmação: published, taken e invalid', async () => {
  const species = { id: 'sp1', name: 'Lumen', code: 'LUM-01' };
  const fetch = reply(200, { status: 'published', species });
  vi.stubGlobal('fetch', fetch);
  await expect(confirmSpecies('tok')).resolves.toEqual({ published: species });
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(`${API_URL}/api/genesis/confirm`);
  expect(JSON.parse(init.body as string)).toEqual({ token: 'tok' });

  vi.stubGlobal('fetch', reply(200, { status: 'taken' }));
  await expect(confirmSpecies('tok')).resolves.toBe('taken');
  vi.stubGlobal('fetch', reply(200, { status: 'invalid' }));
  await expect(confirmSpecies('tok')).resolves.toBe('invalid');
  vi.stubGlobal('fetch', reply(429, { status: 'slow_down' }));
  await expect(confirmSpecies('tok')).resolves.toBe('slow_down');
});
