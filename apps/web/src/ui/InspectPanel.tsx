import { useEffect, useState, type CSSProperties } from 'react';
import { formatAge, formatDiet, formatPosition } from '../lib/format';
import { PALETTE } from '../lib/palette';
import { useRoster, useSelection, useWorld } from '../services/WorldProvider';
import type { Vitals } from '../services/worldStore';
import type { Vec3 } from '../services/wire';

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';
const SERIF = 'Georgia, "Times New Roman", serif';
/** Posição e energia no painel é atualizada a 4 Hz: legível, e barata. */
const SAMPLE_INTERVAL_MS = 250;

interface Sampled {
  position: Vec3 | null;
  energy: number;
  juvenile: boolean;
}

/** Posição, energia e fase amostradas do store a 4 Hz; null sem amostra. */
function useSampled(id: string | null): Sampled | null {
  const { store } = useWorld();
  const [sampled, setSampled] = useState<Sampled | null>(null);
  useEffect(() => {
    if (id === null) return;
    const p: Vec3 = [0, 0, 0];
    const v: Vec3 = [0, 0, 0];
    const vitals: Vitals = { energy: 0, juvenile: false, dividing: false, maturedAtMs: null, dividingSinceMs: null, dyingSinceMs: null };
    const read = () => {
      if (!store.vitals(id, vitals)) return setSampled(null);
      const hasPos = store.sample(id, performance.now(), p, v);
      setSampled({ position: hasPos ? ([p[0], p[1], p[2]] as Vec3) : null, energy: vitals.energy, juvenile: vitals.juvenile });
    };
    read();
    const timer = setInterval(read, SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [id, store]);
  return sampled;
}

const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, font: `12px/1.7 ${MONO}` };
const label: CSSProperties = { opacity: 0.55, letterSpacing: '0.08em' };
const button: CSSProperties = {
  font: `11px/1 ${MONO}`,
  letterSpacing: '0.08em',
  color: PALETTE.fg,
  background: 'transparent',
  border: '1px solid rgba(220,235,232,0.3)',
  padding: '7px 10px',
  cursor: 'pointer',
};

/** Painel do organismo selecionado, à direita. Não aparece sem seleção. */
export function InspectPanel() {
  const { id, following } = useSelection();
  const roster = useRoster();
  const { store, selection } = useWorld();
  const org = id === null ? undefined : roster.find((o) => o.id === id);
  const sampled = useSampled(org ? org.id : null);
  if (!org) return null;

  const species = store.species().find((s) => s.id === org.species);
  const age = formatAge(store.serverNow(performance.now()) - org.born_ms);

  return (
    <aside
      style={{
        position: 'fixed',
        right: 16,
        top: 16,
        width: 260,
        padding: 16,
        color: PALETTE.fg,
        background: 'rgba(2,10,16,0.72)',
        border: '1px solid rgba(220,235,232,0.18)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div style={{ font: `11px/1.4 ${MONO}`, letterSpacing: '0.08em', opacity: 0.6 }}>INDIVÍDUO · {org.id}</div>
        <button type="button" aria-label="Fechar" onClick={() => selection.clear()} style={{ ...button, padding: '2px 7px' }}>
          ✕
        </button>
      </div>
      <h2 style={{ margin: '10px 0 8px', font: `400 22px/1.2 ${SERIF}` }}>{species?.name ?? org.species}</h2>
      <div style={{ height: 1, background: 'rgba(220,235,232,0.18)', margin: '8px 0' }} />
      <div style={row}>
        <span style={label}>ESPÉCIE</span>
        <span>{species?.code ?? org.species}</span>
      </div>
      <div style={row}>
        <span style={label}>FASE</span>
        <span>{sampled ? (sampled.juvenile ? 'jovem' : 'adulto') : org.stage === 'juvenile' ? 'jovem' : 'adulto'}</span>
      </div>
      <div style={row}>
        <span style={label}>ENERGIA</span>
        <span>{`${Math.round((sampled ? sampled.energy : org.e) * 100)}%`}</span>
      </div>
      <div style={row}>
        <span style={label}>GERAÇÃO</span>
        <span>{org.gen}</span>
      </div>
      <div style={row}>
        <span style={label}>COME</span>
        <span>{species ? formatDiet(species.diet, store.species()) : '—'}</span>
      </div>
      <div style={row}>
        <span style={label}>NASCEU DE</span>
        <span>{org.parent ?? '—'}</span>
      </div>
      <div style={row}>
        <span style={label}>SURGIU</span>
        <span>{age}</span>
      </div>
      <div style={row}>
        <span style={label}>POSIÇÃO</span>
        <span>{sampled?.position ? formatPosition(sampled.position) : '—'}</span>
      </div>
      <button type="button" onClick={() => selection.setFollowing(!following)} style={{ ...button, width: '100%', marginTop: 12 }}>
        {following ? 'DEIXAR DE SEGUIR' : 'SEGUIR'}
      </button>
    </aside>
  );
}
