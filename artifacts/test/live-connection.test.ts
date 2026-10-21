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

function connect(known: string[] = ['mac'], probe: (port: number) => Promise<boolean> = async () => true, Socket = FakeSocket) {
  const presence: any[] = [];
  const events: unknown[] = [];
  const remembered: string[] = [];
  const connection = createLiveConnection({
    url: RELAY,
    cloudId: 'c1',
    artifact: 'html/c1',
    WebSocket: Socket as never,
    retryMs: 10,
    maxRetryMs: 40,
    directTimeoutMs: 50,
    probe,
    known: { has: (id) => known.includes(id), remember: (id) => { remembered.push(id); if (!known.includes(id)) known.push(id); } },
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

  test('a first visit tries the advertised host while requests keep using the relay until verification succeeds', async () => {
    let allow!: (allowed: boolean) => void;
    const { connection, socket, presence, remembered } = connect([], () => new Promise((resolve) => { allow = resolve; }));
    relayOnline(socket(RELAY));
    const direct = socket(DIRECT);
    expect(direct).toBeDefined();
    expect(presence.at(-1)).toEqual({ online: true, version: '1.14.0', via: 'relay' });
    direct!.open();
    direct!.receive({ t: 'presence', online: true, version: '1.14.0' });
    const pending = connection.request({ op: 'meta' });
    expect(socket(RELAY)!.sent.at(-1)).toMatchObject({ body: { op: 'meta' } });
    socket(RELAY)!.receive({ t: 'reply', rid: socket(RELAY)!.sent.at(-1).rid, body: { ok: true, data: 'relay meta' } });
    expect(await pending).toBe('relay meta');
    expect(remembered).toEqual([]);
    allow(true);
    await Promise.resolve();
    expect(presence.at(-1).via).toBe('direct');
    expect(remembered).toEqual(['mac']);
  });

  test('known hosts are tried first, then another advertised host when the first fails', async () => {
    const other = { hostId: 'other', port: 4200, key: 'k2' };
    const { connection, socket, presence } = connect();
    relayOnline(socket(RELAY), [other, HOST]);
    expect(FakeSocket.all.map((s) => s.url)).toEqual([RELAY, DIRECT]);
    socket(DIRECT)!.close();
    const next = socket('ws://127.0.0.1:4200/relay/a/c1?key=k2');
    expect(next).toBeDefined();
    next!.open();
    next!.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    expect(presence.at(-1).via).toBe('direct');
    const reply = connection.request({ op: 'meta' });
    next!.receive({ t: 'reply', rid: next!.sent.at(-1).rid, body: { ok: true, data: 'other host' } });
    expect(await reply).toBe('other host');
  });

  test('a failed first attempt is not repeated by duplicate presence messages or timers', async () => {
    vi.useFakeTimers();
    const { socket } = connect();
    relayOnline(socket(RELAY), [HOST, { ...HOST }]);
    socket(DIRECT)!.close();
    socket(RELAY)!.receive({ t: 'presence', online: true, version: '1.14.0', hosts: [HOST] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(1);
  });

  test('changed host credentials and a host coming online again each allow a fresh first attempt', () => {
    const { socket } = connect();
    relayOnline(socket(RELAY));
    socket(DIRECT)!.close();
    const changed = { ...HOST, key: 'renewed' };
    const nextUrl = 'ws://127.0.0.1:4100/relay/a/c1?key=renewed';
    socket(RELAY)!.receive({ t: 'presence', online: true, version: '1.14.0', hosts: [changed] });
    expect(socket(nextUrl)).toBeDefined();
    socket(nextUrl)!.close();
    socket(RELAY)!.receive({ t: 'presence', online: false, version: null });
    socket(RELAY)!.receive({ t: 'presence', online: true, version: '1.14.0', hosts: [changed] });
    expect(FakeSocket.all.filter((s) => s.url === nextUrl)).toHaveLength(2);
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

  test('a previously successful direct pipe retries with backoff without needing new presence', async () => {
    vi.useFakeTimers();
    const { connection, socket, presence } = connect();
    relayOnline(socket(RELAY));
    const direct = socket(DIRECT)!;
    direct.open();
    direct.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    direct.close();
    expect(presence.at(-1)).toEqual({ online: true, version: '1.14.0', via: 'relay' });
    const pending = connection.request({ op: 'meta' });
    expect(socket(RELAY)!.sent.at(-1)).toMatchObject({ body: { op: 'meta' } });
    socket(RELAY)!.receive({ t: 'reply', rid: socket(RELAY)!.sent.at(-1).rid, body: { ok: true, data: 'fallback' } });
    expect(await pending).toBe('fallback');
    await vi.advanceTimersByTimeAsync(9);
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(2);
    socket(DIRECT)!.close();
    socket(RELAY)!.receive({ t: 'presence', online: true, version: '1.14.0', hosts: [HOST] });
    await vi.advanceTimersByTimeAsync(19);
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(3);
    socket(DIRECT)!.close();
    await vi.advanceTimersByTimeAsync(40);
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(4);
    socket(DIRECT)!.close();
    await vi.advanceTimersByTimeAsync(40);
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(5);
    const restored = socket(DIRECT)!;
    restored.open();
    restored.receive({ t: 'presence', online: true, version: '1.14.1' });
    await Promise.resolve();
    expect(presence.at(-1)).toEqual({ online: true, version: '1.14.1', via: 'direct' });
    const reply = connection.request({ op: 'state' });
    restored.receive({ t: 'reply', rid: restored.sent.at(-1).rid, body: { ok: true, data: 'restored state' } });
    expect(await reply).toBe('restored state');
    restored.close();
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(6);
  });

  test('an offline host or a closed page cancels automatic direct retries', async () => {
    vi.useFakeTimers();
    const { connection, socket } = connect();
    relayOnline(socket(RELAY));
    socket(DIRECT)!.open();
    socket(DIRECT)!.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    socket(DIRECT)!.close();
    socket(RELAY)!.receive({ t: 'presence', online: false, version: null });
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(1);
    socket(RELAY)!.receive({ t: 'presence', online: true, version: '1.14.0', hosts: [HOST] });
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(2);
    connection.close();
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeSocket.all.filter((s) => s.url === DIRECT)).toHaveLength(2);
  });

  test('a refused HTTP check during recovery stops further automatic attempts for that candidate', async () => {
    vi.useFakeTimers();
    let allowed = true;
    const { socket, presence } = connect([], async () => allowed);
    relayOnline(socket(RELAY));
    socket(DIRECT)!.open();
    socket(DIRECT)!.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    allowed = false;
    socket(DIRECT)!.close();
    await vi.advanceTimersByTimeAsync(10);
    const recovering = socket(DIRECT)!;
    recovering.open();
    recovering.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    socket(RELAY)!.receive({ t: 'presence', online: true, version: '1.14.0', hosts: [HOST] });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(presence.at(-1).via).toBe('relay');
    expect(recovering.readyState).toBe(3);
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

  test('a rejected HTTP probe falls back and continues with the next candidate', async () => {
    const { socket, presence } = connect(['mac'], async (port) => {
      if (port === 4100) throw new Error('network refused');
      return true;
    });
    relayOnline(socket(RELAY), [HOST, { hostId: 'other', port: 4200, key: 'k2' }]);
    socket(DIRECT)!.open();
    socket(DIRECT)!.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    await Promise.resolve();
    expect(socket(DIRECT)!.readyState).toBe(3);
    const next = socket('ws://127.0.0.1:4200/relay/a/c1?key=k2');
    expect(next).toBeDefined();
    next!.open();
    next!.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    expect(presence.at(-1).via).toBe('direct');
  });

  test('a removed candidate cannot take over after its permission check finishes', async () => {
    let allow!: (ok: boolean) => void;
    const { socket, presence, remembered } = connect(['mac'], () => new Promise((resolve) => { allow = resolve; }));
    relayOnline(socket(RELAY));
    socket(DIRECT)!.open();
    socket(DIRECT)!.receive({ t: 'presence', online: true, version: '1.14.0' });
    socket(RELAY)!.receive({ t: 'presence', online: true, version: '1.14.0', hosts: [] });
    allow(true);
    await Promise.resolve();
    expect(presence.at(-1).via).toBe('relay');
    expect(remembered).toEqual([]);
  });

  test('a browser refusing a socket constructor does not prevent another candidate from working', async () => {
    class RestrictedSocket extends FakeSocket {
      constructor(url: string) {
        if (url === DIRECT) throw new DOMException('refused', 'SecurityError');
        super(url);
      }
    }
    const { socket, presence } = connect(['mac'], async () => true, RestrictedSocket);
    relayOnline(socket(RELAY), [HOST, { hostId: 'other', port: 4200, key: 'k2' }]);
    const next = socket('ws://127.0.0.1:4200/relay/a/c1?key=k2');
    expect(next).toBeDefined();
    next!.open();
    next!.receive({ t: 'presence', online: true, version: '1.14.0' });
    await Promise.resolve();
    expect(presence.at(-1).via).toBe('direct');
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

  test('closing the page while permission is pending prevents a late takeover', async () => {
    let allow!: (ok: boolean) => void;
    const { connection, socket, presence, remembered } = connect([], () => new Promise((resolve) => { allow = resolve; }));
    relayOnline(socket(RELAY));
    socket(DIRECT)!.open();
    socket(DIRECT)!.receive({ t: 'presence', online: true, version: '1.14.0' });
    connection.close();
    allow(true);
    await Promise.resolve();
    expect(presence.every((p) => p.via === 'relay')).toBe(true);
    expect(remembered).toEqual([]);
  });

  test('hosts without direct connection information still serve requests over the relay', async () => {
    const { connection, socket } = connect([]);
    socket(RELAY)!.open();
    socket(RELAY)!.receive({ t: 'presence', online: true, version: '1.13.0' });
    const pending = connection.request({ op: 'meta' });
    socket(RELAY)!.receive({ t: 'reply', rid: socket(RELAY)!.sent.at(-1).rid, body: { ok: true, data: 'legacy host' } });
    expect(await pending).toBe('legacy host');
    expect(FakeSocket.all.map((s) => s.url)).toEqual([RELAY]);
  });
});
