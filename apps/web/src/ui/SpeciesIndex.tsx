import { useMemo, useState, type CSSProperties } from 'react';
import { PALETTE } from '../lib/palette';
import { useRoster, useSelection, useWorld } from '../services/WorldProvider';

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';
const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  width: '100%',
  padding: '5px 0',
  font: `12px/1.5 ${MONO}`,
  color: PALETTE.fg,
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid rgba(220,235,232,0.12)',
  cursor: 'pointer',
  textAlign: 'left',
};

/** Índice recolhível de espécies → indivíduos. Escolher um indivíduo seleciona, sem seguir. */
export function SpeciesIndex() {
  const roster = useRoster();
  const { store, selection } = useWorld();
  const { id: selectedId } = useSelection();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const groups = useMemo(
    () =>
      store
        .species()
        .map((s) => ({ species: s, ids: roster.filter((o) => o.species === s.id).map((o) => o.id) }))
        .filter((g) => g.ids.length > 0),
    [roster, store],
  );

  const toggle = (speciesId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(speciesId)) next.delete(speciesId);
      else next.add(speciesId);
      return next;
    });

  return (
    <nav aria-label="Índice do terrário" style={{ position: 'fixed', left: 16, bottom: 40, width: 240, color: PALETTE.fg }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ ...row, borderBottom: 'none', letterSpacing: '0.08em' }}
      >
        NO TERRÁRIO · {roster.length}
      </button>
      {open && (
        <div style={{ maxHeight: '50vh', overflowY: 'auto', marginTop: 6 }}>
          {groups.map((g) => (
            <div key={g.species.id}>
              <button type="button" onClick={() => toggle(g.species.id)} style={row}>
                <span>{g.species.name}</span>
                {' '}
                <span>{g.ids.length}</span>
              </button>
              {expanded.has(g.species.id) &&
                g.ids.map((oid) => (
                  <button
                    key={oid}
                    type="button"
                    aria-current={oid === selectedId ? 'true' : undefined}
                    onClick={() => selection.select(oid)}
                    style={{ ...row, paddingLeft: 14, opacity: oid === selectedId ? 1 : 0.7 }}
                  >
                    <span aria-hidden="true">{oid === selectedId ? '● ' : '  '}</span>
                    {oid}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
