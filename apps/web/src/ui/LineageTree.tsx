import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { formatCause, formatDayMonth, formatDiff, formatExtinctDate, formatShares } from '../lib/format';
import { buildLineage, firstLiving, rootOf, type LineageNode } from '../lib/lineage';
import { PALETTE } from '../lib/palette';
import { useLineageUi } from '../services/lineageUi';
import { fetchHistory, type HistoryNode, type HistoryTree } from '../services/speciesApi';
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
const ALERT = '#e6b8a0';
const vivos = (n: number) => `${n} ${n === 1 ? 'vivo' : 'vivos'}`;
const note: CSSProperties = { font: `12px/1.5 ${MONO}`, color: PALETTE.fg, opacity: 0.6, whiteSpace: 'pre' };

/** Linha secundária de um nó (nascimento, causa, reta final), alinhada sob o nome. */
function Note({ prefix, children }: { prefix: string; children: string }) {
  return (
    <div style={note}>
      <span aria-hidden="true" style={{ opacity: 0.6 }}>{prefix}</span>
      <span>{children}</span>
    </div>
  );
}

/** Nó da árvore com a história do servidor: datas, diferenças de peças e extinções com causa. */
function HistNode({ node, isRoot, prefix, childPrefix, living, selectedSpecies, onPick }: {
  node: HistoryNode;
  isRoot: boolean;
  prefix: string;
  childPrefix: string;
  living: ReadonlyMap<string, number>;
  selectedSpecies: string | null;
  onPick: (speciesId: string) => void;
}) {
  const ex = node.extinct;
  const n = living.get(node.id) ?? 0;
  const clickable = !ex && n > 0;
  const under = childPrefix + (node.children.length > 0 ? '│   ' : '    ');
  const diff = formatDiff(node.diff);
  return (
    <>
      <button
        type="button"
        disabled={!clickable}
        aria-current={node.id === selectedSpecies ? 'true' : undefined}
        onClick={() => onPick(node.id)}
        style={{ ...line, cursor: clickable ? 'pointer' : 'default', opacity: clickable || ex ? 1 : 0.5 }}
      >
        <span>
          <span aria-hidden="true" style={{ opacity: 0.4 }}>{prefix}</span>
          {node.name}
        </span>
        {' '}
        <span style={ex ? { color: ALERT } : undefined}>{ex ? `✕ extinta ${formatExtinctDate(Date.parse(ex.at))}` : vivos(n)}</span>
      </button>
      {!isRoot && node.born_at && <Note prefix={under}>{`nasceu ${formatDayMonth(node.born_at)}${diff ? ` · ${diff}` : ''}`}</Note>}
      {ex && <Note prefix={under}>{`última morte: ${formatCause(ex.cause, ex.predator?.name ?? null)}`}</Note>}
      {ex && ex.final.length > 0 && <Note prefix={under}>{`últimos 30 min: ${formatShares(ex.final)}`}</Note>}
      {node.children.map((c, i) => {
        const last = i === node.children.length - 1;
        return (
          <HistNode
            key={c.id}
            node={c}
            isRoot={false}
            prefix={childPrefix + (last ? '└── ' : '├── ')}
            childPrefix={childPrefix + (last ? '    ' : '│   ')}
            living={living}
            selectedSpecies={selectedSpecies}
            onPick={onPick}
          />
        );
      })}
    </>
  );
}

/**
 * História da raiz pela API; buscada de novo quando muda o conjunto de espécies ou de extintas
 * da linhagem na store. Sem resposta (rede, 404), null: a árvore fica como antes do gate P.
 */
function useHistory(rootId: string | null, species: readonly { id: string; root: string }[], extinct: ReadonlyMap<string, number>) {
  const [loaded, setLoaded] = useState<{ rootId: string; tree: HistoryTree | null } | null>(null);
  const key = useMemo(
    () => (rootId ? species.filter((s) => s.root === rootId).map((s) => `${s.id}${extinct.has(s.id) ? '!' : ''}`).join(',') : ''),
    [rootId, species, extinct],
  );
  useEffect(() => {
    if (!rootId) return;
    let live = true;
    fetchHistory(rootId).then(
      (tree) => {
        if (live) setLoaded({ rootId, tree });
      },
      () => {
        if (live) setLoaded({ rootId, tree: null });
      },
    );
    return () => {
      live = false;
    };
  }, [rootId, key]);
  return loaded && loaded.rootId === rootId ? loaded.tree : null;
}
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
  const { rootId: requested } = useLineageUi();

  const selectedSpecies = selectedId ? store.roster().find((o) => o.id === selectedId)?.species ?? null : null;
  // A raiz pedida pelo buscador vale até a árvore fechar; depois, a da seleção, como antes.
  const rootId = requested ?? ((selectedSpecies && rootOf(species, selectedSpecies)) || chosen);
  const history = useHistory(rootId, species, extinct);

  const tree = useMemo(() => (rootId ? buildLineage(species, bySpecies, extinct, rootId) : null), [species, bySpecies, extinct, rootId]);
  const roots = useMemo(() => {
    if (tree || history) return [];
    const ids = new Set(species.map((s) => s.id));
    return species
      .filter((s) => s.parent === null || !ids.has(s.parent))
      .map((s) => buildLineage(species, bySpecies, extinct, s.id))
      .filter((t): t is LineageNode => t !== null && countOf(t) > 0);
  }, [tree, history, species, bySpecies, extinct]);

  const pick = (speciesId: string) => {
    const id = firstLiving(store, speciesId);
    if (id) selection.select(id);
  };

  const born = tree?.species.born_ms;
  const title = history
    ? history.root.born_at
      ? `${history.root.name} (criada em ${formatDayMonth(history.root.born_at)})`
      : history.root.name
    : tree
      ? born != null
        ? `${tree.species.name} (criada em ${dayMonth(born)})`
        : tree.species.name
      : 'Escolha uma espécie';

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
      {history && history.restarts.length > 0 && (
        <div style={{ ...note, marginBottom: 4 }}>{`mundo recomeçado em ${history.restarts.map(formatDayMonth).join(', ')}`}</div>
      )}
      {history ? (
        <HistNode node={history.root} isRoot prefix="" childPrefix="" living={bySpecies} selectedSpecies={selectedSpecies} onPick={pick} />
      ) : tree ? (
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
