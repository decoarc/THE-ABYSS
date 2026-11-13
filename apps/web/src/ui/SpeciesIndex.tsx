import { useMemo, useState, type CSSProperties } from 'react';
import { formatExtinctDate } from '../lib/format';
import { PALETTE } from '../lib/palette';
import type { Vitals } from '../services/worldStore';
import { buildLineage, type LineageNode } from '../lib/lineage';
import type { SpeciesInfo } from '../services/wire';
import { useRoster, useSelection, useWorld } from '../services/WorldProvider';
import { useLiving } from './useLiving';

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
  const { species, extinct, bySpecies, total: living } = useLiving();

  const groups = useMemo(() => {
    const vitals: Vitals = { energy: 0, juvenile: false, dividing: false, maturedAtMs: null, dividingSinceMs: null, dyingSinceMs: null };
    const liveIds = roster
      .filter((o) => store.vitals(o.id, vitals) && vitals.dyingSinceMs === null)
      .map((o) => ({ id: o.id, species: o.species }));
    // Cada raiz seguida dos seus ramos em profundidade; só entra quem vive ou está extinto.
    const known = new Set(species.map((s) => s.id));
    const out: { species: SpeciesInfo; depth: number; extinctMs: number | null; ids: string[] }[] = [];
    const walk = (n: LineageNode, depth: number) => {
      if (n.extinctMs !== null || n.living > 0) {
        out.push({ species: n.species, depth, extinctMs: n.extinctMs, ids: liveIds.filter((o) => o.species === n.species.id).map((o) => o.id) });
      }
      for (const c of n.children) walk(c, depth + 1);
    };
    for (const s of species) {
      if (s.parent !== null && known.has(s.parent)) continue;
      const tree = buildLineage(species, bySpecies, extinct, s.id);
      if (tree) walk(tree, 0);
    }
    return out;
  }, [roster, store, species, extinct, bySpecies]);

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
        NO TERRÁRIO · {living}
      </button>
      {open && (
        <div style={{ maxHeight: '50vh', overflowY: 'auto', marginTop: 6 }}>
          {groups.map((g) => (
            <div key={g.species.id}>
              <button
                type="button"
                onClick={() => g.extinctMs === null && toggle(g.species.id)}
                style={{ ...row, paddingLeft: g.depth * 10, ...(g.extinctMs !== null ? { opacity: 0.5, cursor: 'default' } : {}) }}
              >
                <span>{g.species.name}</span>
                {' '}
                <span>{g.extinctMs !== null ? `extinta · ${formatExtinctDate(g.extinctMs)}` : g.ids.length}</span>
              </button>
              {g.extinctMs === null &&
                expanded.has(g.species.id) &&
                g.ids.map((oid) => (
                  <button
                    key={oid}
                    type="button"
                    aria-current={oid === selectedId ? 'true' : undefined}
                    onClick={() => selection.select(oid)}
                    style={{ ...row, paddingLeft: g.depth * 10 + 14, opacity: oid === selectedId ? 1 : 0.7 }}
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
