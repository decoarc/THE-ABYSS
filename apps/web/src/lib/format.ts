import type { FinalShare, HistoryCause } from '../services/speciesApi';
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
  if (diet.kind === 'predator') return 'criaturas menores';
  return diet.prey.map((id) => species.find((s) => s.id === id)?.name ?? id).join(' e ');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Instante de extinção como dd/mm hh:mm, em hora local. */
export function formatExtinctDate(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Data ISO (hora real) como dd/mm, em hora local. */
export function formatDayMonth(iso: string): string {
  return formatExtinctDate(Date.parse(iso)).slice(0, 5);
}

/** Diferença de peças: "+flagelo −placa" (ordem alfabética; menos U+2212; "+2 ocelo" se mais de uma). */
export function formatDiff(diff: Readonly<Record<string, number>>): string {
  return Object.keys(diff)
    .filter((k) => diff[k] !== 0)
    .sort()
    .map((k) => {
      const n = diff[k];
      const sign = n > 0 ? '+' : '−';
      return Math.abs(n) === 1 ? `${sign}${k}` : `${sign}${Math.abs(n)} ${k}`;
    })
    .join(' ');
}

/** Causa de morte ou de extinção em pt-BR; null = extinção de antes do registro de causas. */
export function formatCause(cause: HistoryCause | null, predator: string | null = null): string {
  if (cause === null) return 'causa não registrada';
  if (cause === 'starvation') return 'fome';
  if (cause === 'old_age') return 'velhice';
  if (cause === 'branched') return 'todos passaram para ramos';
  return predator ? `predação por ${predator}` : 'predação';
}

/** Divisão das mortes da reta final: "70% predação por Garra, 30% fome". */
export function formatShares(final: readonly FinalShare[]): string {
  return final.map((f) => `${Math.round(f.share * 100)}% ${formatCause(f.cause, f.predator_name)}`).join(', ');
}
