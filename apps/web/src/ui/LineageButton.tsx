import { PALETTE } from '../lib/palette';
import { lineageUi, useLineageUi } from '../services/lineageUi';
import { LineageTree } from './LineageTree';

/** Botão minimizado (só o ícone de árvore) que abre o fluxograma da espécie; o buscador também a abre. */
export function LineageButton() {
  const { open } = useLineageUi();
  return (
    <>
      <button
        type="button"
        aria-label="Árvore da espécie"
        aria-expanded={open}
        onClick={lineageUi.toggle}
        style={{
          position: 'fixed',
          right: 16,
          bottom: 52,
          width: 34,
          height: 34,
          display: 'grid',
          placeItems: 'center',
          color: PALETTE.fg,
          background: 'rgba(2,10,16,0.72)',
          border: '1px solid rgba(220,235,232,0.3)',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
          <path d="M9 16V9M9 9L4 5M9 9l5-4M4 5V2.5M14 5V2.5M9 9V2.5" />
          <circle cx="9" cy="2.5" r="1.2" />
          <circle cx="4" cy="2.5" r="1.2" />
          <circle cx="14" cy="2.5" r="1.2" />
        </svg>
      </button>
      {open && <LineageTree onClose={lineageUi.close} />}
    </>
  );
}
