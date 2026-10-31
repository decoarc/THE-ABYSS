import { PALETTE } from '../lib/palette';
import { useConnectionStatus } from '../services/WorldProvider';

/** Aviso discreto enquanto o canal do mundo ainda não abriu. */
export function ConnectionNotice() {
  const status = useConnectionStatus();
  if (status !== 'connecting') return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 14,
        textAlign: 'center',
        font: '11px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace',
        color: PALETTE.fg,
        opacity: 0.6,
        pointerEvents: 'none',
      }}
    >
      conectando…
    </div>
  );
}
