import { useEffect } from 'react';
import { PALETTE } from '../lib/palette';

const SERIF = 'Georgia, "Times New Roman", serif';
export const GENESIS_NOTICE_MS = 8000;

/** Aviso sobre o mundo depois de abrir o link do e-mail; some sozinho em 8 s. */
export function GenesisNotice({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, GENESIS_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'min(520px, calc(100vw - 32px))',
        padding: '12px 18px',
        font: `400 17px/1.4 ${SERIF}`,
        textAlign: 'center',
        color: PALETTE.fg,
        background: 'rgba(2,10,16,0.82)',
        border: '1px solid rgba(220,235,232,0.18)',
        pointerEvents: 'none',
      }}
    >
      {message}
    </div>
  );
}
