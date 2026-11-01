import type { FlyInput } from './freeFly';

const KEYS = new Set(['KeyW', 'KeyS', 'KeyD', 'KeyA', 'Space', 'ShiftLeft', 'ShiftRight']);

/** Campos de texto: as teclas pertencem a quem está digitando. */
function isTyping(el: Element): boolean {
  return el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

/** Botões e links usam o Espaço para se ativar (o "Seguir" do painel, por exemplo). */
function activatesWithSpace(el: Element): boolean {
  return el.closest('button, a[href], summary, [role="button"]') !== null;
}

/** Teclado da câmera livre: WASD nada, Espaço sobe, Shift desce. `read` devolve sempre o mesmo objeto (sem alocação por quadro). */
export function createFlyInput(target: Window): { read(): FlyInput; dispose(): void } {
  const held = new Set<string>();
  const out: FlyInput = { forward: 0, right: 0, up: 0 };

  const onDown = (event: KeyboardEvent) => {
    if (!KEYS.has(event.code) || event.ctrlKey || event.altKey || event.metaKey) return;
    const el = event.target instanceof Element ? event.target : null;
    if (el && isTyping(el)) return;
    if (event.code === 'Space') {
      if (el && activatesWithSpace(el)) return;
      event.preventDefault(); // a página não rola
    }
    held.add(event.code);
  };
  // Soltar sempre vale, mesmo com o foco em outro lugar: tecla presa é câmera correndo sozinha.
  const onUp = (event: KeyboardEvent) => {
    held.delete(event.code);
  };
  const onBlur = () => held.clear();

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);

  const on = (code: string) => (held.has(code) ? 1 : 0);

  return {
    read() {
      out.forward = on('KeyW') - on('KeyS');
      out.right = on('KeyD') - on('KeyA');
      out.up = on('Space') - Math.max(on('ShiftLeft'), on('ShiftRight'));
      return out;
    },
    dispose() {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
      held.clear();
    },
  };
}
