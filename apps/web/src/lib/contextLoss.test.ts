import { renderHook } from '@testing-library/react';
import { useContextLossHandler } from './contextLoss';

function lossEvent() {
  return new Event('webglcontextlost', { cancelable: true });
}

it('perda de contexto com a cena montada é falha', () => {
  const onFail = vi.fn();
  const { result } = renderHook(() => useContextLossHandler(onFail));
  const event = lossEvent();
  result.current(event);
  expect(onFail).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(true);
});

it('o descarte do canvas ao sair da cena não é falha', () => {
  // O R3F chama forceContextLoss() depois que a cena desmonta (ex.: ir para #criar).
  const onFail = vi.fn();
  const { result, unmount } = renderHook(() => useContextLossHandler(onFail));
  const handler = result.current;
  unmount();
  handler(lossEvent());
  expect(onFail).not.toHaveBeenCalled();
});
