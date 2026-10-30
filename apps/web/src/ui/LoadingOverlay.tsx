import { PALETTE } from '../lib/palette';

export function LoadingOverlay({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: PALETTE.bg,
        color: PALETTE.fg,
        font: '12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace',
        letterSpacing: '0.08em',
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.2s ease',
        pointerEvents: 'none',
      }}
    >
      <span style={{ opacity: 0.45 }}>carregando…</span>
    </div>
  );
}
