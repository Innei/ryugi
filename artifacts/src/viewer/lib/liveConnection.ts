import type { LiveHost, RelayPresence } from '../../shared/relay';
import { createRelayConnection, type RelayConnection, type RelayConnectionOptions } from '../document/relayConnection';

export interface KnownHosts {
  has(hostId: string): boolean;
  remember(hostId: string): void;
}

export type LivePresence = { online: boolean; version: string | null; via: 'direct' | 'relay' };

export interface LiveConnectionOptions extends Omit<RelayConnectionOptions, 'onPresence'> {
  cloudId: string;
  known: KnownHosts;
  directTimeoutMs?: number;
  probe?: (port: number) => Promise<boolean>;
  onPresence: (presence: LivePresence) => void;
}

const DIRECT_TIMEOUT_MS = 2000;

// Chrome does not yet ask permission for WebSockets to 127.0.0.1, but it does for fetch and frames; probing with fetch keeps a refused permission from leaving every content frame blank.
const probeLoopback = (port: number) =>
  fetch(`http://127.0.0.1:${port}/robots.txt`, { mode: 'no-cors', cache: 'no-store' }).then(
    () => true,
    () => false,
  );

interface Candidate {
  key: string;
  host: LiveHost;
  tried: boolean;
  succeeded: boolean;
  retryAt: number;
  delay: number;
}

export function createLiveConnection(options: LiveConnectionOptions): RelayConnection {
  const baseRetry = options.retryMs ?? 1000;
  const maxRetry = options.maxRetryMs ?? 30_000;
  let relayPresence: RelayPresence = { online: false, version: null };
  let candidates: Candidate[] = [];
  let direct: { candidate: Candidate; connection: RelayConnection; version: string | null; probing: boolean } | null = null;
  let directLive = false;
  let attempt: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const report = () =>
    options.onPresence(directLive && direct ? { online: true, version: direct.version, via: 'direct' } : { online: relayPresence.online, version: relayPresence.version, via: 'relay' });

  const closeDirect = () => {
    clearTimeout(attempt);
    const current = direct;
    direct = null;
    directLive = false;
    current?.connection.close();
    return current;
  };

  const failed = (candidate: Candidate, retryAllowed: boolean) => {
    if (candidate.succeeded) {
      candidate.retryAt = retryAllowed ? Date.now() + candidate.delay : Number.POSITIVE_INFINITY;
      candidate.delay = Math.min(candidate.delay * 2, maxRetry);
    }
    choose();
  };

  const fallBack = (retryAllowed = true) => {
    const wasLive = directLive;
    const current = closeDirect();
    if (wasLive) {
      report();
      if (relayPresence.online) options.onOnline();
    }
    if (current) failed(current.candidate, retryAllowed);
  };

  const tryDirect = (candidate: Candidate) => {
    const { host } = candidate;
    candidate.tried = true;
    try {
      const connection: RelayConnection = createRelayConnection({
        url: `ws://127.0.0.1:${host.port}/relay/a/${encodeURIComponent(options.cloudId)}?key=${encodeURIComponent(host.key)}`,
        artifact: options.artifact,
        WebSocket: options.WebSocket,
        requestTimeoutMs: options.requestTimeoutMs,
        onPresence: (presence) => {
          if (direct?.connection !== connection) return;
          if (!presence.online) {
            fallBack();
            return;
          }
          clearTimeout(attempt);
          direct.version = presence.version;
          if (directLive || direct.probing) return;
          direct.probing = true;
          const checked = (allowed: boolean) => {
            if (direct?.connection !== connection || directLive) return;
            direct.probing = false;
            if (!allowed) {
              fallBack(false);
              return;
            }
            directLive = true;
            candidate.succeeded = true;
            candidate.delay = baseRetry;
            options.known.remember(host.hostId);
            report();
            options.onOnline();
          };
          try {
            void (options.probe ?? probeLoopback)(host.port).then(checked, () => checked(false));
          } catch {
            checked(false);
          }
        },
        onEvent: (event) => {
          if (directLive && direct?.connection === connection) options.onEvent(event);
        },
        onOnline: () => {},
      });
      direct = { candidate, connection, version: null, probing: false };
      attempt = setTimeout(() => {
        if (direct?.connection === connection && !directLive) fallBack();
      }, options.directTimeoutMs ?? DIRECT_TIMEOUT_MS);
    } catch {
      failed(candidate, false);
    }
  };

  function choose() {
    clearTimeout(retry);
    if (closed || direct || !relayPresence.online) return;
    const now = Date.now();
    const candidate = candidates.find((item) => !item.tried || (item.succeeded && item.retryAt <= now));
    if (candidate) return tryDirect(candidate);
    const next = Math.min(...candidates.filter((item) => item.succeeded).map((item) => item.retryAt));
    if (Number.isFinite(next)) retry = setTimeout(choose, Math.max(0, next - now));
  }

  const relay = createRelayConnection({
    ...options,
    onPresence: (presence) => {
      if (closed) return;
      const reopened = presence.online && !relayPresence.online;
      relayPresence = presence;
      if (!directLive) report();
      if (presence.online) {
        const previous = candidates;
        const seen = new Set<string>();
        candidates = (presence.hosts ?? []).flatMap((host) => {
          const key = JSON.stringify([host.hostId, host.port, host.key]);
          if (seen.has(key)) return [];
          seen.add(key);
          const candidate = previous.find((item) => item.key === key) ?? { key, host, tried: false, succeeded: false, retryAt: 0, delay: baseRetry };
          if (reopened && candidate !== direct?.candidate) {
            candidate.tried = false;
            candidate.retryAt = 0;
            candidate.delay = baseRetry;
          }
          return [candidate];
        }).sort((a, b) => Number(options.known.has(b.host.hostId)) - Number(options.known.has(a.host.hostId)));
        if (direct && !candidates.includes(direct.candidate)) fallBack(false);
      }
      choose();
    },
    onEvent: (event) => {
      if (!closed && !directLive) options.onEvent(event);
    },
    onOnline: () => {
      if (!closed && !directLive) options.onOnline();
    },
  });

  return {
    request: (body) => (directLive && direct ? direct.connection : relay).request(body),
    close() {
      closed = true;
      clearTimeout(retry);
      closeDirect();
      relay.close();
    },
  };
}
