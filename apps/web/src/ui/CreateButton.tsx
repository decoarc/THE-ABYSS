import { PALETTE } from '../lib/palette';

const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

/** Canto inferior direito do mundo: leva à tela de criação. */
export function CreateButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="abyss-create"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 14,
        font: `11px/1 ${MONO}`,
        letterSpacing: '0.08em',
        color: PALETTE.fg,
        background: 'rgba(2,10,16,0.72)',
        border: '1px solid rgba(220,235,232,0.3)',
        padding: '9px 12px',
        cursor: 'pointer',
      }}
    >
      CRIAR ESPÉCIE
    </button>
  );
}
