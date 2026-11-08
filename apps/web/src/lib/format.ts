import type { SpeciesInfo, Vec3 } from '../services/wire';

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

/** Dieta em pt-BR; presas pelo nome da espécie, separadas por " e ". */
export function formatDiet(diet: SpeciesInfo['diet'], species: readonly SpeciesInfo[]): string {
  if (diet.kind === 'flora') return 'flora';
  if (diet.kind === 'particles') return 'partículas';
  return diet.prey.map((id) => species.find((s) => s.id === id)?.name ?? id).join(' e ');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Instante de extinção como dd/mm hh:mm, em hora local. */
export function formatExtinctDate(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
