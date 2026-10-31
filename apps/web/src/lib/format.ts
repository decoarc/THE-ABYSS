import type { Vec3 } from '../services/wire';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Idade em pt-BR, sem segundos: a leitura muda a cada minuto, não a cada quadro. */
export function formatAge(ms: number): string {
  if (ms < MINUTE) return 'há menos de 1 min';
  if (ms < HOUR) return `há ${Math.floor(ms / MINUTE)} min`;
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / MINUTE);
  return `há ${h} h ${m} min`;
}

/** x · y · z com uma casa decimal, separados por ponto médio. */
export function formatPosition(p: Vec3): string {
  return p.map((v) => v.toFixed(1)).join(' · ');
}
