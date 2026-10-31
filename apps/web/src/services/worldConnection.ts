import { Socket } from 'phoenix';
import type { TickMessage, WorldSnapshot } from './wire';
import type { WorldStore } from './worldStore';

export interface PushLike {
  receive(status: string, cb: (payload?: any) => void): PushLike;
}

export interface ChannelLike {
  join(): PushLike;
  on(event: string, cb: (payload: any) => void): unknown;
  leave(): unknown;
}

/** Subconjunto de phoenix.Socket usado pelo cliente. */
export interface SocketLike {
  connect(): void;
  disconnect(): void;
  onOpen(cb: () => void): unknown;
  onError(cb: () => void): unknown;
  onClose(cb: () => void): unknown;
  channel(topic: string): ChannelLike;
}

export interface ConnectOptions {
  url: string;
  socketFactory?: (url: string) => SocketLike;
}

const TOPIC = 'world:main';

export const defaultSocketFactory = (url: string): SocketLike => new Socket(url) as unknown as SocketLike;

/** Conecta o store ao canal world:main. Devolve a função de desconexão. */
export function connectWorld(store: WorldStore, opts: ConnectOptions): () => void {
  const socket = (opts.socketFactory ?? defaultSocketFactory)(opts.url);
  let channel: ChannelLike | null = null;
  let stopped = false;

  const down = () => store.setStatus('connecting');
  socket.onOpen(() => {});
  socket.onError(down);
  socket.onClose(down);

  function join() {
    const ch = socket.channel(TOPIC);
    channel = ch;
    let resyncing = false;
    ch.on('tick', (msg: TickMessage) => {
      if (stopped || channel !== ch || resyncing) return;
      if (store.applyTick(msg, performance.now()) === 'resync') {
        resyncing = true;
        store.setStatus('connecting');
        ch.leave();
        join();
      }
    });
    // O phoenix refaz o join sozinho após reconexão; o 'ok' dispara de novo.
    ch.join().receive('ok', (snapshot: WorldSnapshot) => {
      if (stopped || channel !== ch) return;
      store.applySnapshot(snapshot, performance.now());
      store.setStatus('live');
    });
  }

  socket.connect();
  join();

  return () => {
    stopped = true;
    channel?.leave();
    channel = null;
    socket.disconnect();
  };
}
