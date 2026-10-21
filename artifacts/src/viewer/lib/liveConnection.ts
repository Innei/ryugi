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

export function createLiveConnection(options: LiveConnectionOptions): RelayConnection {
  let relayPresence: RelayPresence = { online: false, version: null };
  let direct: RelayConnection | null = null;
  let directLive = false;
  let directVersion: string | null = null;
  let attempt: ReturnType<typeof setTimeout> | undefined;
  let probing = false;

  const report = () =>
    options.onPresence(directLive ? { online: true, version: directVersion, via: 'direct' } : { online: relayPresence.online, version: relayPresence.version, via: 'relay' });

  const fallBack = () => {
    clearTimeout(attempt);
    const wasLive = directLive;
    const current = direct;
    direct = null;
    directLive = false;
    probing = false;
    current?.close();
    if (!wasLive) return;
    report();
    if (relayPresence.online) options.onOnline();
  };

  const tryDirect = (host: LiveHost) => {
    if (direct) return;
    const connection: RelayConnection = createRelayConnection({
      url: `ws://127.0.0.1:${host.port}/relay/a/${encodeURIComponent(options.cloudId)}?key=${encodeURIComponent(host.key)}`,
      artifact: options.artifact,
      WebSocket: options.WebSocket,
      requestTimeoutMs: options.requestTimeoutMs,
      onPresence: (presence) => {
        if (direct !== connection) return;
        if (!presence.online) {
          fallBack();
          return;
        }
        clearTimeout(attempt);
        directVersion = presence.version;
        if (directLive || probing) return;
        probing = true;
        void (options.probe ?? probeLoopback)(host.port).then((allowed) => {
          probing = false;
          if (direct !== connection || directLive) return;
          if (!allowed) {
            fallBack();
            return;
          }
          directLive = true;
          options.known.remember(host.hostId);
          report();
          options.onOnline();
        });
      },
      onEvent: (event) => {
        if (directLive && direct === connection) options.onEvent(event);
      },
      onOnline: () => {},
    });
    direct = connection;
    attempt = setTimeout(() => {
      if (!directLive) fallBack();
    }, options.directTimeoutMs ?? DIRECT_TIMEOUT_MS);
  };

  const relay = createRelayConnection({
    ...options,
    onPresence: (presence) => {
      relayPresence = presence;
      if (!directLive) report();
      const host = presence.online ? presence.hosts?.find((candidate) => options.known.has(candidate.hostId)) : undefined;
      if (host) tryDirect(host);
    },
    onEvent: (event) => {
      if (!directLive) options.onEvent(event);
    },
    onOnline: () => {
      if (!directLive) options.onOnline();
    },
  });

  return {
    request: (body) => (directLive && direct ? direct : relay).request(body),
    close() {
      clearTimeout(attempt);
      direct?.close();
      direct = null;
      relay.close();
    },
  };
}
