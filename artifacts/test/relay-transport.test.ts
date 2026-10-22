import { afterEach, describe, expect, test, vi } from 'vitest';
import { createChannel } from '../src/viewer/document/channel';
import { createRelayConnection } from '../src/viewer/document/relayConnection';
import { createLocalTransport, createRelayTransport } from '../src/viewer/document/transport';

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

const connections: { close(): void }[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  FakeSocket.all = [];
});

function connect() {
  const events: unknown[] = [];
  const presence: unknown[] = [];
  let opened = 0;
  const connection = createRelayConnection({
    url: 'wss://cloud.example/api/relay/a/c1',
    artifact: 'document/c1',
    WebSocket: FakeSocket as never,
    retryMs: 10,
    onPresence: (p) => presence.push(p),
    onEvent: (e) => events.push(e),
    onOnline: () => opened++,
  });
  connections.push(connection);
  const socket = () => FakeSocket.all.at(-1)!;
  return { connection, socket, events, presence, opened: () => opened };
}

describe('requests', () => {
  test('a reply resolves the matching request', async () => {
    const { connection, socket } = connect();
    socket().open();
    const first = connection.request({ op: 'state' });
    const second = connection.request({ op: 'meta' });
    const [a, b] = socket().sent;
    expect(a).toEqual({ t: 'request', rid: 1, body: { op: 'state' } });
    socket().receive({ t: 'reply', rid: b.rid, body: { ok: true, data: 'meta' } });
    socket().receive({ t: 'reply', rid: a.rid, body: { ok: true, data: 'state' } });
    expect(await first).toBe('state');
    expect(await second).toBe('meta');
  });

  test('a refused request or an offline host rejects', async () => {
    const { connection, socket } = connect();
    socket().open();
    const refused = connection.request({ op: 'x' });
    socket().receive({ t: 'reply', rid: 1, body: { ok: false, error: 'unknown request' } });
    await expect(refused).rejects.toThrow('unknown request');
    const offline = connection.request({ op: 'state' });
    socket().receive({ t: 'error', rid: 2, error: 'offline' });
    await expect(offline).rejects.toThrow('offline');
  });

  test('requests made before the socket opens wait for it, and a closed socket rejects pending ones', async () => {
    const { connection, socket } = connect();
    const early = connection.request({ op: 'state' });
    expect(socket().sent).toEqual([]);
    socket().open();
    expect(socket().sent).toHaveLength(1);
    socket().close();
    await expect(early).rejects.toThrow();
  });
});

describe('presence and events', () => {
  test('presence is reported and a host coming online signals a resync', () => {
    const { socket, presence, opened } = connect();
    socket().open();
    socket().receive({ t: 'presence', online: false, version: null });
    socket().receive({ t: 'presence', online: true, version: '1.13.0' });
    expect(presence).toEqual([{ online: false, version: null }, { online: true, version: '1.13.0' }]);
    expect(opened()).toBe(1);
    socket().receive({ t: 'presence', online: true, version: '1.13.0' });
    expect(opened()).toBe(1);
  });

  test('host events are renamed to this page’s artifact', () => {
    const { socket, events } = connect();
    socket().open();
    socket().receive({ t: 'event', body: { type: 'doc-comments', artifact: 'document/plan', comments: { version: 1, threads: [] } } });
    expect(events).toEqual([{ type: 'doc-comments', artifact: 'document/c1', comments: { version: 1, threads: [] } }]);
  });

  test('losing the socket reports offline and reconnects', async () => {
    const { socket, presence } = connect();
    socket().open();
    socket().receive({ t: 'presence', online: true, version: '1.13.0' });
    const firstSocket = socket();
    firstSocket.close();
    expect(presence.at(-1)).toEqual({ online: false, version: null });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(FakeSocket.all.length).toBe(2);
  });

  test('closing stops reconnecting', async () => {
    const { connection, socket } = connect();
    socket().open();
    connection.close();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(FakeSocket.all.length).toBe(1);
  });
});

describe('relay document transport', () => {
  function transport() {
    const presence: unknown[] = [];
    const relay = createRelayTransport({
      url: 'wss://cloud.example/api/relay/a/c1',
      artifact: 'document/c1',
      contentBase: 'https://cloud.example/content/c1/',
      WebSocket: FakeSocket as never,
      retryMs: 10,
      onPresence: (p) => presence.push(p),
    });
    connections.push(relay);
    const socket = FakeSocket.all.at(-1)!;
    socket.open();
    const reply = (data: unknown) => {
      const { rid } = socket.sent.at(-1);
      socket.receive({ t: 'reply', rid, body: { ok: true, data } });
    };
    return { relay, socket, reply, presence };
  }

  test('meta keeps the host’s fields but loads relayed assets from the given content base', async () => {
    const { relay, socket, reply } = transport();
    const meta = relay.meta();
    expect(socket.sent.at(-1).body).toEqual({ op: 'meta' });
    reply({ title: 'Plan', contentBase: '/content/document/plan/', warnings: [] });
    expect(await meta).toEqual({ title: 'Plan', contentBase: 'https://cloud.example/content/c1/', warnings: [] });
  });

  test('a host on this computer keeps its own absolute content base', async () => {
    const { relay, reply } = transport();
    const meta = relay.meta();
    reply({ title: 'Plan', contentBase: 'http://127.0.0.1:4100/c/token/document/plan/', warnings: [] });
    expect((await meta)!.contentBase).toBe('http://127.0.0.1:4100/c/token/document/plan/');
  });

  test('loaded and runtime-error reports from embedded blocks go to the host as client reports', () => {
    const { relay, socket } = transport();
    const error = { type: 'runtime-error', artifact: 'document/c1', file: 'assets/chart.html', message: 'boom' };
    relay.send(error);
    expect(socket.sent.at(-1).body).toEqual({ op: 'client', message: error });
    const loaded = { type: 'loaded', artifact: 'document/c1', file: 'assets/chart.html' };
    relay.send(loaded);
    expect(socket.sent.at(-1).body).toEqual({ op: 'client', message: loaded });
  });

  test('updates travel as base64 and comments return the new comments', async () => {
    const { relay, socket, reply } = transport();
    const update = relay.update(new Uint8Array([1, 2, 255]));
    expect(socket.sent.at(-1).body).toEqual({ op: 'update', bytes: 'AQL/', features: ['pending'] });
    reply(null);
    await update;
    const op = { op: 'reply' as const, threadId: 't1', text: 'ok' };
    const comment = relay.comment(op);
    expect(socket.sent.at(-1).body).toEqual({ op: 'comment', comment: op });
    reply({ comments: { version: 1, threads: [] } });
    expect(await comment).toEqual({ version: 1, threads: [] });
  });

  test('selection messages become selection requests and other messages are not relayed', () => {
    const { relay, socket } = transport();
    const before = socket.sent.length;
    relay.send({ type: 'dynamic', artifact: 'document/c1', payload: 1 });
    expect(socket.sent.length).toBe(before);
    const selection = { type: 'selection', artifact: 'document/c1', tab: 't', human: true, quote: 'q', blockIds: ['b'], heading: '' };
    relay.send(selection);
    expect(socket.sent.at(-1).body).toEqual({ op: 'selection', selection });
  });

  test('host events reach the channel and a host coming online asks for a resync', () => {
    const { relay, socket, presence } = transport();
    const seen: unknown[] = [];
    relay.channel.subscribe((event) => seen.push(event));
    socket.receive({ t: 'presence', online: true, version: '1.13.0' });
    socket.receive({ t: 'event', body: { type: 'doc-status', artifact: 'document/plan', streaming: true } });
    expect(presence).toEqual([{ online: true, version: '1.13.0' }]);
    expect(seen).toEqual([{ type: 'open' }, { type: 'doc-status', artifact: 'document/c1', streaming: true }]);
  });
});

describe('local document transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('talks to the local server and fails loudly when it refuses', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (url.endsWith('/update')) return new Response('no', { status: 500 });
      if (url.endsWith('/comments')) return Response.json({ comments: { version: 1, threads: [] } });
      if (url.endsWith('/state')) return Response.json({ snapshot: 'AA==', lineage: 'l', cursor: null });
      return Response.json({ title: 'Plan', contentBase: '/content/document/plan/' });
    });
    const sent: unknown[] = [];
    const local = createLocalTransport({ id: 'plan', channel: createChannel(), send: (m) => sent.push(m) });
    expect(local.artifact).toBe('document/plan');
    expect(await local.meta()).toEqual({ title: 'Plan', contentBase: '/content/document/plan/' });
    expect(await local.state()).toEqual({ snapshot: 'AA==', lineage: 'l', cursor: null });
    await expect(local.update(new Uint8Array([1]))).rejects.toThrow('update failed (500)');
    expect(await local.comment({ op: 'resolve', threadId: 't' })).toEqual({ version: 1, threads: [] });
    local.send({ type: 'selection' });
    expect(sent).toEqual([{ type: 'selection' }]);
    expect(calls.map(([url]) => url)).toEqual([
      '/api/artifacts/document/plan',
      '/api/document/plan/state',
      '/api/document/plan/update',
      '/api/document/plan/comments',
    ]);
    const update = calls.find(([url]) => url.endsWith('/update'))![1]!;
    expect(new Headers(update.headers).get('X-Ryugi-Document-Features')).toBe('pending');
  });
});

describe('requests that never get an answer', () => {
  test('a request times out as offline', async () => {
    const connection = createRelayConnection({
      url: 'wss://cloud.example/api/relay/a/c1',
      artifact: 'document/c1',
      WebSocket: FakeSocket as never,
      requestTimeoutMs: 20,
      onPresence: () => {},
      onEvent: () => {},
      onOnline: () => {},
    });
    connections.push(connection);
    FakeSocket.all.at(-1)!.open();
    await expect(connection.request({ op: 'state' })).rejects.toThrow('offline');
  });

  test('the host going offline fails what it was asked', async () => {
    const { connection, socket } = connect();
    socket().open();
    socket().receive({ t: 'presence', online: true, version: '1.13.0' });
    const pending = connection.request({ op: 'update', bytes: 'AA==' });
    socket().receive({ t: 'presence', online: false, version: null });
    await expect(pending).rejects.toThrow('offline');
  });
});
