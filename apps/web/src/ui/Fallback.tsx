import { PALETTE } from '../lib/palette';

export type FallbackReason = 'no-webgl' | 'error';

const MESSAGES: Record<FallbackReason, string> = {
  'no-webgl': 'Seu navegador não suporta WebGL, necessário para ver The Abyss.',
  error: 'Não foi possível renderizar a cena. Recarregue a página.',
};

export function Fallback({ reason }: { reason: FallbackReason }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: PALETTE.bg,
      }}
    >
      <p
        role="alert"
        style={{
          margin: 0,
          maxWidth: '36ch',
          textAlign: 'center',
          color: PALETTE.fg,
          font: '15px/1.6 system-ui, sans-serif',
          opacity: 0.85,
        }}
      >
        {MESSAGES[reason]}
      </p>
    </div>
  );
}
