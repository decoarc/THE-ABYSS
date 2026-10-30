import { PALETTE } from '../lib/palette';

export function DemoBadge() {
  return (
    <div
      style={{
        position: 'fixed',
        left: 16,
        bottom: 14,
        font: '11px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace',
        letterSpacing: '0.02em',
        color: PALETTE.fg,
        opacity: 0.55,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      Demonstração visual — não é um ecossistema real
    </div>
  );
}
