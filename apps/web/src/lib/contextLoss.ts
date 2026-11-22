import { useCallback, useEffect, useRef } from 'react';

/**
 * Handler de `webglcontextlost` que só conta como falha enquanto a cena está montada. Ao desmontar
 * o `<Canvas>`, o próprio R3F chama `forceContextLoss()` para liberar o contexto, e esse evento
 * não pode virar a tela de erro.
 */
export function useContextLossHandler(onFail: () => void): (event: Event) => void {
  const mounted = useRef(false);
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback((event: Event) => {
    if (!mounted.current) return;
    event.preventDefault();
    onFailRef.current();
  }, []);
}
