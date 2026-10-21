import { afterEach, describe, expect, test, vi } from 'vitest';
import { createLiveConnection } from '../src/viewer/lib/liveConnection';

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: any[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const RELAY = 'wss://cloud.example/api/relay/a/c1';
const HOST = { hostId: 'mac', port: 4100, key: 'k1' };
const DIRECT = 'ws://127.0.0.1:4100/relay/a/c1?key=k1';
const closers: (() => void)[] = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
  FakeSocket.all = [];
  vi.useRealTimers();
});

function connect(known: string[] = ['mac'], probe: (port: number) => Promise<boolean> = async () => true) {
  const presence: any[] = [];
  const events: unknown[] = [];
  const remembered: string[] = [];
  const connection = createLiveConnection({
    url: RELAY,
    cloudId: 'c1',
    artifact: 'html/c1',
    WebSocket: FakeSocket as never,
    retryMs: 10,
    directTimeoutMs: 50,
    probe,
    known: { has: (id) => known.includes(id), remember: (id) => remembered.push(id) },
    onPresence: (p) => presence.push(p),
    onEvent: (e) => events.push(e),
    onOnline: () => {},
  });
  closers.push(connection.close);
  const socket = (url: string) => FakeSocket.all.filter((s) => s.url === url).at(-1);
  return { connection, socket, presence, events, remembered };
}

function relayOnline(socket: FakeSocket | undefined, hosts = [HOST]) {
  socket!.open();
  socket!.receive({ t: 'presence', online: true, version: '1.14.0', hosts });
}

describe('choosing the pipe', () => {
  test('a known host on this computer is tried directly and takes over once it answers', async () => {
    const { connection, socket, presence, remembered } = connect();
    relayOnline(socket(RELAY));
    const direct = socket(DIRECT);
    expect(direct).toBeDefined();
    direct!.open();
    direct!.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    expect(presence.at(-1)).toEqual({ online: true, version: '1.14.0', via: 'direct' });
    expect(remembered).toEqual(['mac']);
    const reply = connection.request({ op: 'meta' });
    expect(direct!.sent.at(-1)).toMatchObject({ t: 'request', body: { op: 'meta' } });
    expect(socket(RELAY)!.sent).toEqual([]);
    direct!.receive({ t: 'reply', rid: direct!.sent.at(-1).rid, body: { ok: true, data: 'direct meta' } });
    expect(await reply).toBe('direct meta');
  });

  test('a host this browser does not know is never tried', () => {
    const { socket, presence } = connect([]);
    relayOnline(socket(RELAY));
    expect(socket(DIRECT)).toBeUndefined();
    expect(presence.at(-1)).toEqual({ online: true, version: '1.14.0', via: 'relay' });
  });

  test('a direct attempt that does not answer in time is dropped and the relay carries on', async () => {
    const { connection, socket, presence } = connect();
    relayOnline(socket(RELAY));
    const direct = socket(DIRECT)!;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(direct.readyState).toBe(3);
    expect(presence.every((p) => p.via === 'relay')).toBe(true);
    void connection.request({ op: 'meta' }).catch(() => {});
    expect(socket(RELAY)!.sent.at(-1)).toMatchObject({ body: { op: 'meta' } });
  });

  test('when the direct pipe drops, the relay takes over again and direct is retried on its next presence', async () => {
    const { connection, socket, presence } = connect();
    relayOnline(socket(RELAY));
    const direct = socket(DIRECT)!;
    direct.open();
    direct.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    direct.close();
    expect(presence.at(-1)).toEqual({ online: true, version: '1.14.0', via: 'relay' });
    void connection.request({ op: 'meta' }).catch(() => {});
    expect(socket(RELAY)!.sent.at(-1)).toMatchObject({ body: { op: 'meta' } });
    socket(RELAY)!.receive({ t: 'presence', online: true, version: '1.14.0', hosts: [HOST] });
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(2);
  });

  test('events come from the pipe in use only', async () => {
    const { socket, events } = connect();
    relayOnline(socket(RELAY));
    const direct = socket(DIRECT)!;
    direct.open();
    direct.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    socket(RELAY)!.receive({ t: 'event', body: { type: 'change', artifact: 'html/page', files: ['a'] } });
    direct.receive({ t: 'event', body: { type: 'change', artifact: 'html/page', files: ['b'] } });
    expect(events).toEqual([{ type: 'change', artifact: 'html/c1', files: ['b'] }]);
  });

  test('the socket alone is not enough: if the browser refuses local network access, the relay stays', async () => {
    const { socket, presence, remembered } = connect(['mac'], async () => false);
    relayOnline(socket(RELAY));
    const direct = socket(DIRECT)!;
    direct.open();
    direct.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    await Promise.resolve();
    expect(presence.every((p) => p.via === 'relay')).toBe(true);
    expect(direct.readyState).toBe(3);
    expect(remembered).toEqual([]);
  });

  test('a permission prompt left open past the timeout still switches once it is allowed', async () => {
    let allow!: (ok: boolean) => void;
    const { socket, presence } = connect(['mac'], () => new Promise((resolve) => (allow = resolve)));
    relayOnline(socket(RELAY));
    const direct = socket(DIRECT)!;
    direct.open();
    direct.receive({ t: 'presence', online: true, version: '1.14.0' });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(presence.at(-1).via).toBe('relay');
    allow(true);
    await Promise.resolve();
    expect(presence.at(-1)).toEqual({ online: true, version: '1.14.0', via: 'direct' });
  });
});
