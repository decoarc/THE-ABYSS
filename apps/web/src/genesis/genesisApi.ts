import type { Blueprint } from '../services/wire';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export type SubmitResult = 'sent' | 'slow_down' | { errors: Record<string, string[]> };
export type ConfirmResult = 'invalid' | 'taken' | 'slow_down' | { published: { id: string; name: string; code: string } };

async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    // corpo vazio ou não-JSON: decide só pelo status
  }
  return { status: res.status, json };
}

/** Pede o link de confirmação. Lança se a resposta não for nenhuma das esperadas (rede, 400, 500). */
export async function submitSpecies(form: { email: string; name: string; blueprint: Blueprint }): Promise<SubmitResult> {
  const { status, json } = await post('/api/genesis/submit', form);
  if (status === 202) return 'sent';
  if (status === 429) return 'slow_down';
  if (status === 422 && typeof json.errors === 'object' && json.errors !== null) {
    return { errors: json.errors as Record<string, string[]> };
  }
  throw new Error(`envio recusado (${status})`);
}

/** Confirma o token do e-mail. Lança se a resposta não for nenhuma das esperadas. */
export async function confirmSpecies(token: string): Promise<ConfirmResult> {
  const { status, json } = await post('/api/genesis/confirm', { token });
  if (status === 429) return 'slow_down';
  if (status === 200) {
    if (json.status === 'published' && typeof json.species === 'object' && json.species !== null) {
      const s = json.species as { id: string; name: string; code: string };
      return { published: { id: s.id, name: s.name, code: s.code } };
    }
    if (json.status === 'taken') return 'taken';
    if (json.status === 'invalid') return 'invalid';
  }
  throw new Error(`confirmação recusada (${status})`);
}
