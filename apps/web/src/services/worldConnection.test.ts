import { connectWorld, type SocketLike } from './worldConnection';
import { createWorldStore } from './worldStore';
import type { WorldSnapshot } from './wire';

type Cb = (payload?: unknown) => void;

class FakeChannel {
  joins = 0;
  left = false;
  handlers = new Map<string, Cb>();
  okCbs: Cb[] = [];
  join() {
    this.joins++;
    const push = {
      receive: (status: string, cb: Cb) => {
        if (status === 'ok') this.okCbs.push(cb);
        return push;
      },
    };
    return push;
  }
  on(ev: string, cb: Cb) {
    this.handlers.set(ev, cb);
  }
  leave() {
    this.left = true;
  }
  fireOk(p: unknown) {
    this.okCbs.forEach((c) => c(p));
  }
  fireTick(p: unknown) {
    this.handlers.get('tick')?.(p);
  }
}

class FakeSocket implements SocketLike {
  connected = false;
  disconnected = false;
  channels: FakeChannel[] = [];
  openCb: Cb = () => {};
  errorCb: Cb = () => {};
  closeCb: Cb = () => {};
  connect() {
    this.connected = true;
  }
  disconnect() {
    this.disconnected = true;
  }
  onOpen(cb: Cb) {
    this.openCb = cb;
  }
  onError(cb: Cb) {
    this.errorCb = cb;
  }
  onClose(cb: Cb) {
    this.closeCb = cb;
  }
  channel() {
    const c = new FakeChannel();
    this.channels.push(c);
    return c;
  }
}

const snap = (world_id: string, n = 2): WorldSnapshot => ({
  world_id,
  tick: 1,
  tick_hz: 10,
  server_ms: 1000,
  map_id: 'e1',
  creature_scale: 0.5,
  bounds: { y_min: -5, y_max: 5 },
  species: [],
  organisms: Array.from({ length: n }, (_, i) => ({
    id: `o${i}`,
    species: 's',
    born_ms: 0,
    p: [i, 0, 0],
    v: [0, 0, 0],
  })),
});

function setup() {
  const store = createWorldStore();
  const socket = new FakeSocket();
  const stop = connectWorld(store, { url: 'ws://x/socket', socketFactory: () => socket });
  return { store, socket, stop };
}

it('join ok aplica snapshot e fica live', () => {
  const { store, socket } = setup();
  expect(socket.connected).toBe(true);
  expect(store.status()).toBe('connecting');
  socket.channels[0].fireOk(snap('w1'));
  expect(store.worldId()).toBe('w1');
  expect(store.roster()).toHaveLength(2);
  expect(store.status()).toBe('live');
});

it('tick vai para o store', () => {
  const { store, socket } = setup();
  const ch = socket.channels[0];
  ch.fireOk(snap('w1'));
  ch.fireTick({ world_id: 'w1', tick: 2, server_ms: 1100, o: [[5, 0, 0, 0, 0, 0], [6, 0, 0, 0, 0, 0]] });
  expect(store.debugBufferSize('o0')).toBe(2);
});

it('queda do socket volta a connecting', () => {
  const { store, socket } = setup();
  socket.channels[0].fireOk(snap('w1'));
  expect(store.status()).toBe('live');
  socket.closeCb();
  expect(store.status()).toBe('connecting');
  socket.channels[0].fireOk(snap('w1'));
  expect(store.status()).toBe('live');
  socket.errorCb();
  expect(store.status()).toBe('connecting');
});

it('resync on new world_id', () => {
  const { store, socket } = setup();
  const first = socket.channels[0];
  first.fireOk(snap('w1'));
  first.fireTick({ world_id: 'w2', tick: 5, server_ms: 2000, o: [] });
  first.fireTick({ world_id: 'w2', tick: 6, server_ms: 2100, o: [] });
  expect(first.left).toBe(true);
  expect(socket.channels).toHaveLength(2);
  expect(socket.channels[1].joins).toBe(1);
  socket.channels[1].fireOk(snap('w2', 3));
  expect(store.worldId()).toBe('w2');
  expect(store.roster()).toHaveLength(3);
  expect(store.status()).toBe('live');
});

it('o retorno do join depois da reconexão troca o mundo', () => {
  const { store, socket } = setup();
  const ch = socket.channels[0];
  ch.fireOk(snap('w1'));
  socket.closeCb();
  ch.fireOk(snap('w2', 4));
  expect(store.worldId()).toBe('w2');
  expect(store.roster()).toHaveLength(4);
});

it('desmontar desconecta', () => {
  const { socket, stop } = setup();
  stop();
  expect(socket.disconnected).toBe(true);
  expect(socket.channels[0].left).toBe(true);
});
