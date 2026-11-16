import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { nearestLiving } from '../lib/lineage';
import { PALETTE } from '../lib/palette';
import { readCamera } from '../scene/cameraPose';
import { lineageUi } from '../services/lineageUi';
import { searchSpecies, type SearchResult } from '../services/speciesApi';
import { useWorld } from '../services/WorldProvider';

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';
const WAIT_MS = 250;
const MIN_CHARS = 2;
const NOTICE_COLOR = '#e6b8a0';

const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  width: '100%',
  padding: '4px 0',
  font: `12px/1.5 ${MONO}`,
  color: PALETTE.fg,
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(220,235,232,0.1)',
  textAlign: 'left',
  cursor: 'pointer',
};

type Found = { kind: 'idle' } | { kind: 'results'; list: SearchResult[] } | { kind: 'empty' } | { kind: 'error' };

/**
 * Buscador de espécies e ramos pelo nome (alto à esquerda). Escolher uma viva leva a câmera
 * até a criatura dela mais próxima e passa a segui-la; extinta com ramo vivo segue o ramo e
 * abre a árvore da raiz; linhagem toda extinta só abre a árvore.
 */
export function SpeciesSearch() {
  const { store, selection } = useWorld();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found>({ kind: 'idle' });
  const asked = useRef(0);

  useEffect(() => {
    const text = q.trim();
    if (text.length < MIN_CHARS) return;
    const n = ++asked.current;
    const timer = setTimeout(() => {
      searchSpecies(text).then(
        (list) => {
          if (n === asked.current) setFound(list.length > 0 ? { kind: 'results', list } : { kind: 'empty' });
        },
        () => {
          if (n === asked.current) setFound({ kind: 'error' });
        },
      );
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const follow = (speciesIds: ReadonlySet<string>): boolean => {
    const id = nearestLiving(store, speciesIds, readCamera().pos, performance.now());
    if (!id) return false;
    selection.select(id);
    selection.setFollowing(true);
    return true;
  };

  const choose = (r: SearchResult) => {
    asked.current++;
    setFound({ kind: 'idle' });
    if (r.alive && follow(new Set([r.id]))) return;
    if (!r.alive) {
      const prefix = `${r.id}.`;
      follow(new Set(store.species().filter((s) => s.id.startsWith(prefix)).map((s) => s.id)));
    }
    lineageUi.open(r.root);
  };

  return (
    <div
      role="search"
      style={{
        position: 'fixed',
        left: 16,
        top: 16,
        width: 240,
        maxWidth: 'calc(100vw - 32px)',
        padding: '8px 10px',
        color: PALETTE.fg,
        background: 'rgba(2,10,16,0.72)',
        border: '1px solid rgba(220,235,232,0.3)',
        font: `12px/1.5 ${MONO}`,
        boxSizing: 'border-box',
      }}
    >
      <input
        type="search"
        aria-label="Buscar espécie"
        placeholder="buscar espécie"
        value={q}
        maxLength={64}
        onChange={(event) => {
          asked.current++;
          setQ(event.target.value);
          setFound({ kind: 'idle' });
        }}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '4px 6px',
          color: PALETTE.fg,
          background: 'transparent',
          border: '1px solid rgba(220,235,232,0.35)',
          font: `12px/1.5 ${MONO}`,
        }}
      />
      {found.kind === 'results' && (
        <div style={{ maxHeight: '40vh', overflowY: 'auto', marginTop: 4 }}>
          {found.list.map((r) => (
            <button key={r.id} type="button" onClick={() => choose(r)} style={row}>
              <span>{r.name}</span>
              {!r.alive && <span style={{ color: NOTICE_COLOR, opacity: 0.8 }}>extinta</span>}
            </button>
          ))}
        </div>
      )}
      {found.kind === 'empty' && <div role="status" style={{ marginTop: 4, color: NOTICE_COLOR }}>Nenhuma espécie com esse nome</div>}
      {found.kind === 'error' && <div role="status" style={{ marginTop: 4, color: NOTICE_COLOR }}>Não foi possível falar com o abismo.</div>}
    </div>
  );
}
