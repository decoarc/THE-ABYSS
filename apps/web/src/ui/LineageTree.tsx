import { useMemo, useState, type CSSProperties } from 'react';
import { formatExtinctDate } from '../lib/format';
import { buildLineage, firstLiving, rootOf, type LineageNode } from '../lib/lineage';
import { PALETTE } from '../lib/palette';
import { useSelection, useWorld } from '../services/WorldProvider';
import { useLiving } from './useLiving';

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';
const line: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  width: '100%',
  padding: '3px 0',
  font: `12px/1.5 ${MONO}`,
  color: PALETTE.fg,
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
  whiteSpace: 'pre',
};

const dayMonth = (ms: number) => formatExtinctDate(ms).slice(0, 5);
const countOf = (n: LineageNode): number => n.living + n.children.reduce((a, c) => a + countOf(c), 0);

function Node({ node, prefix, childPrefix, selectedSpecies, onPick }: {
  node: LineageNode;
  prefix: string;
  childPrefix: string;
  selectedSpecies: string | null;
  onPick: (speciesId: string) => void;
}) {
  const extinct = node.extinctMs !== null;
  const clickable = !extinct && node.living > 0;
  const info = extinct ? `extinta · ${formatExtinctDate(node.extinctMs!)}` : `${node.living} ${node.living === 1 ? 'vivo' : 'vivos'}`;
  return (
    <>
      <button
        type="button"
        disabled={!clickable}
        aria-current={node.species.id === selectedSpecies ? 'true' : undefined}
        onClick={() => onPick(node.species.id)}
        style={{ ...line, cursor: clickable ? 'pointer' : 'default', opacity: clickable ? 1 : 0.5 }}
      >
        <span>
          <span aria-hidden="true" style={{ opacity: 0.4 }}>{prefix}</span>
          {node.species.name}
        </span>
        {' '}
        <span>{info}</span>
      </button>
      {node.children.map((c, i) => {
        const last = i === node.children.length - 1;
        return (
          <Node
            key={c.species.id}
            node={c}
            prefix={childPrefix + (last ? '└── ' : '├── ')}
            childPrefix={childPrefix + (last ? '    ' : '│   ')}
            selectedSpecies={selectedSpecies}
            onPick={onPick}
          />
        );
      })}
    </>
  );
}

/** Fluxograma da árvore da espécie selecionada; sem seleção, escolhe-se uma raiz com vivos. */
export function LineageTree({ onClose }: { onClose: () => void }) {
  const { store, selection } = useWorld();
  const { id: selectedId } = useSelection();
  const { species, extinct, bySpecies } = useLiving();
  const [chosen, setChosen] = useState<string | null>(null);

  const selectedSpecies = selectedId ? store.roster().find((o) => o.id === selectedId)?.species ?? null : null;
  const rootId = (selectedSpecies && rootOf(species, selectedSpecies)) || chosen;

  const tree = useMemo(() => (rootId ? buildLineage(species, bySpecies, extinct, rootId) : null), [species, bySpecies, extinct, rootId]);
  const roots = useMemo(() => {
    if (tree) return [];
    const ids = new Set(species.map((s) => s.id));
    return species
      .filter((s) => s.parent === null || !ids.has(s.parent))
      .map((s) => buildLineage(species, bySpecies, extinct, s.id))
      .filter((t): t is LineageNode => t !== null && countOf(t) > 0);
  }, [tree, species, bySpecies, extinct]);

  const pick = (speciesId: string) => {
    const id = firstLiving(store, speciesId);
    if (id) selection.select(id);
  };

  const born = tree?.species.born_ms;
  const title = tree ? (born != null ? `${tree.species.name} (criada em ${dayMonth(born)})` : tree.species.name) : 'Escolha uma espécie';

  return (
    <div
      role="dialog"
      aria-label="Árvore da espécie"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 94,
        maxWidth: 'min(420px, calc(100vw - 32px))',
        maxHeight: '60vh',
        overflow: 'auto',
        padding: '10px 12px',
        color: PALETTE.fg,
        background: 'rgba(2,10,16,0.72)',
        border: '1px solid rgba(220,235,232,0.3)',
        font: `12px/1.5 ${MONO}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <span>{title}</span>
        <button type="button" onClick={onClose} style={{ ...line, width: 'auto', padding: 0, cursor: 'pointer', opacity: 0.7 }}>
          fechar
        </button>
      </div>
      {tree ? (
        <Node node={tree} prefix="" childPrefix="" selectedSpecies={selectedSpecies} onPick={pick} />
      ) : (
        roots.map((t) => (
          <button key={t.species.id} type="button" onClick={() => setChosen(t.species.id)} style={{ ...line, cursor: 'pointer' }}>
            <span>{t.species.name}</span>
            <span>{countOf(t)}</span>
          </button>
        ))
      )}
    </div>
  );
}
