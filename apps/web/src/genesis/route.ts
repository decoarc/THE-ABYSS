import { useEffect, useState } from 'react';

export type Route = { kind: 'world' } | { kind: 'create' } | { kind: 'confirm'; token: string };

const CONFIRM = /^#confirmar=([A-Za-z0-9_-]+)$/;

/** `''` → mundo, `#criar` → criação, `#confirmar=<token>` → confirmação; qualquer outra coisa é o mundo. */
export function parseRoute(hash: string): Route {
  if (hash === '#criar') return { kind: 'create' };
  const m = CONFIRM.exec(hash);
  if (m) return { kind: 'confirm', token: m[1] };
  return { kind: 'world' };
}

const ROUTE_EVENT = 'abyss:route';

/** Troca o hash (com ou sem entrada nova no histórico) e avisa quem usa `useRoute`. */
export function navigate(hash: string, { replace = false }: { replace?: boolean } = {}): void {
  const { pathname, search } = window.location;
  const url = `${pathname}${search}${hash}`;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

/** Rota atual; acompanha `hashchange`, voltar/avançar do navegador e `navigate`. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const update = () =>
      setRoute((prev) => {
        const next = parseRoute(window.location.hash);
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    update();
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    window.addEventListener(ROUTE_EVENT, update);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
      window.removeEventListener(ROUTE_EVENT, update);
    };
  }, []);
  return route;
}
