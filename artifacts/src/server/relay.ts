import WebSocket from 'ws';
import type { RelayReply } from '../shared/relay';

export interface RelayClientOptions {
  url: string;
  version: string;
  pollMs?: number;
  heartbeatMs?: number;
  handshakeTimeoutMs?: number;
  token: () => string | null;
  served: () => Map<string, string>;
  handle: (key: string, body: unknown, conn: string) => Promise<unknown>;
  onActivity: () => void;
  onWatch?: (keys: Set<string>) => void;
  local?: () => { hostId: string; port: number; key: string };
}

const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const HANDSHAKE_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

export function createRelayClient(options: RelayClientOptions) {
  let socket: WebSocket | null = null;
  let announced = '';
  let watched = new Set<string>();
  let backoff = 1000;
  let nextAttempt = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let pongDeadline: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const send = (message: unknown) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const idsOf = (served: Map<string, string>) => [...served.keys()].sort();

  const drop = () => {
    clearInterval(heartbeat);
    clearTimeout(pongDeadline);
    socket?.removeAllListeners();
    // ws emits 'error' when a socket still connecting is terminated; with no listener that throws and kills the server.
    socket?.on('error', () => {});
    socket?.terminate();
    socket = null;
    announced = '';
    watched = new Set();
    options.onWatch?.(new Set());
  };

  const reply = (conn: string, rid: unknown, body: RelayReply) =>
    send({ t: 'reply', conn, rid, body });

  const onRequest = async (message: {
    conn?: unknown;
    id?: unknown;
    rid?: unknown;
    body?: unknown;
  }) => {
    if (typeof message.conn !== 'string' || typeof message.id !== 'string') return;
    options.onActivity();
    const key = options.served().get(message.id);
    if (!key) return reply(message.conn, message.rid, { ok: false, error: 'not served here' });
    try {
      reply(message.conn, message.rid, {
        ok: true,
        data: await options.handle(key, message.body, message.conn),
      });
    } catch (err) {
      reply(message.conn, message.rid, { ok: false, error: (err as Error).message });
    }
  };

  const connect = (token: string, served: Map<string, string>) => {
    const ws = new WebSocket(options.url, {
      headers: { Authorization: `Bearer ${token}` },
      handshakeTimeout: options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS,
    });
    socket = ws;
    ws.on('open', () => {
      backoff = 1000;
      announced = idsOf(served).join('\n');
      send({
        t: 'hello',
        version: options.version,
        ids: idsOf(served),
        ...(options.local ? { local: options.local() } : {}),
      });
      heartbeat = setInterval(() => {
        if (watched.size > 0) options.onActivity();
        ws.send('ping');
        pongDeadline ??= setTimeout(drop, PONG_TIMEOUT_MS);
      }, options.heartbeatMs ?? HEARTBEAT_MS);
    });
    ws.on('message', (data) => {
      const text = data.toString();
      if (text === 'pong') {
        clearTimeout(pongDeadline);
        pongDeadline = undefined;
        return;
      }
      let message: { t?: unknown; ids?: unknown };
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      if (message.t === 'watch' && Array.isArray(message.ids)) {
        watched = new Set(message.ids.filter((id): id is string => typeof id === 'string'));
        const served = options.served();
        options.onWatch?.(
          new Set([...watched].flatMap((id) => (served.has(id) ? [served.get(id)!] : []))),
        );
      } else if (message.t === 'request') void onRequest(message as never);
    });
    const lost = () => {
      if (socket !== ws) return;
      drop();
      nextAttempt = Date.now() + backoff;
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    };
    ws.on('close', lost);
    ws.on('error', lost);
  };

  const tick = () => {
    if (closed) return;
    const token = options.token();
    const served = options.served();
    if (!token || served.size === 0) {
      if (socket) drop();
      return;
    }
    if (!socket) {
      if (Date.now() >= nextAttempt) connect(token, served);
      return;
    }
    const ids = idsOf(served).join('\n');
    if (socket.readyState === WebSocket.OPEN && ids !== announced) {
      announced = ids;
      send({ t: 'ids', ids: idsOf(served) });
    }
  };

  const poll = setInterval(tick, options.pollMs ?? 5000);
  tick();

  return {
    emit(key: string, body: unknown) {
      for (const [id, servedKey] of options.served())
        if (servedKey === key && watched.has(id)) send({ t: 'event', id, body });
    },
    refresh: tick,
    close() {
      closed = true;
      clearInterval(poll);
      drop();
    },
  };
}

export type RelayClient = ReturnType<typeof createRelayClient>;
