import type { LiveHost, RelayPresence, RelayReply, RelayRequest } from '../../shared/relay';

type RelayIncoming =
  | { t: 'presence'; online: boolean; version: string | null; hosts?: LiveHost[] }
  | { t: 'reply'; rid: number; body: RelayReply }
  | { t: 'event'; body: { artifact?: string } & Record<string, unknown> }
  | { t: 'error'; rid: number; error: string };

export interface RelayConnectionOptions {
  url: string;
  artifact: string;
  WebSocket?: typeof WebSocket;
  retryMs?: number;
  maxRetryMs?: number;
  requestTimeoutMs?: number;
  onPresence: (presence: RelayPresence) => void;
  onEvent: (event: unknown) => void;
  onOnline: () => void;
}

export interface RelayConnection {
  request<T = unknown>(body: RelayRequest | { op: string }): Promise<T>;
  close(): void;
}

const OFFLINE: RelayPresence = { online: false, version: null };

export function createRelayConnection(options: RelayConnectionOptions): RelayConnection {
  const Socket = options.WebSocket ?? WebSocket;
  const baseRetry = options.retryMs ?? 1000;
  const maxRetry = options.maxRetryMs ?? 30_000;
  const timeoutMs = options.requestTimeoutMs ?? 15_000;
  const pending = new Map<
    number,
    {
      resolve: (data: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const queue: string[] = [];
  let socket: WebSocket | null = null;
  let open = false;
  let online = false;
  let nextRid = 1;
  let delay = baseRetry;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const settle = (rid: number, outcome: { data: unknown } | { error: string }) => {
    const waiter = pending.get(rid);
    if (!waiter) return;
    pending.delete(rid);
    clearTimeout(waiter.timer);
    if ('error' in outcome) waiter.reject(new Error(outcome.error));
    else waiter.resolve(outcome.data);
  };

  const failPending = () => {
    for (const rid of [...pending.keys()]) settle(rid, { error: 'offline' });
  };

  const receive = (message: RelayIncoming) => {
    if (message.t === 'presence') {
      const wasOnline = online;
      online = message.online;
      if (!online) failPending();
      options.onPresence({
        online: message.online,
        version: message.version,
        ...(Array.isArray(message.hosts) ? { hosts: message.hosts } : {}),
      });
      if (online && !wasOnline) options.onOnline();
    } else if (message.t === 'reply') {
      settle(
        message.rid,
        message.body.ok ? { data: message.body.data } : { error: message.body.error },
      );
    } else if (message.t === 'error') {
      settle(message.rid, { error: message.error });
    } else if (message.t === 'event') {
      const body = message.body;
      options.onEvent('artifact' in body ? { ...body, artifact: options.artifact } : body);
    }
  };

  const connect = () => {
    const current = new Socket(options.url);
    socket = current;
    current.onopen = () => {
      open = true;
      delay = baseRetry;
      for (const text of queue.splice(0)) current.send(text);
    };
    current.onmessage = (event) => {
      try {
        receive(JSON.parse(String(event.data)) as RelayIncoming);
      } catch {}
    };
    current.onclose = () => {
      if (socket !== current) return;
      open = false;
      socket = null;
      queue.length = 0;
      failPending();
      online = false;
      options.onPresence(OFFLINE);
      if (closed) return;
      retry = setTimeout(connect, delay);
      delay = Math.min(delay * 2, maxRetry);
    };
  };

  connect();

  return {
    request<T>(body: RelayRequest | { op: string }) {
      const rid = nextRid++;
      const text = JSON.stringify({ t: 'request', rid, body });
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => settle(rid, { error: 'offline' }), timeoutMs);
        pending.set(rid, { resolve: resolve as (data: unknown) => void, reject, timer });
        if (open && socket) socket.send(text);
        else queue.push(text);
      });
    },
    close() {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    },
  };
}
