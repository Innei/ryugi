import { useCallback, useEffect, useState } from 'react';
import type { ArtifactType } from '../../shared/types';
import type { RelayConnection } from '../document/relayConnection';
import { knownHosts } from '../lib/knownHosts';
import { createLiveConnection, type LivePresence } from '../lib/liveConnection';
import type { ArtifactFeed } from './useArtifactFeed';

export const relayUrlFor = (cloudId: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/relay/a/${encodeURIComponent(cloudId)}`;

export function useCloudFeed(cloudId: string, type: ArtifactType, liveContentBase: string): { presence: LivePresence | null; feed: ArtifactFeed } {
  const [presence, setPresence] = useState<LivePresence | null>(null);
  const [revision, setRevision] = useState(0);
  const [connection, setConnection] = useState<RelayConnection | null>(null);

  useEffect(() => {
    const bump = () => setRevision((current) => current + 1);
    const live = createLiveConnection({
      url: relayUrlFor(cloudId),
      cloudId,
      artifact: `${type}/${cloudId}`,
      known: knownHosts(),
      onPresence: setPresence,
      onEvent: (event) => {
        if ((event as { type?: unknown }).type === 'change') bump();
      },
      onOnline: bump,
    });
    setConnection(live);
    return () => {
      live.close();
      setConnection(null);
      setPresence(null);
    };
  }, [cloudId, type]);

  const load = useCallback(async () => {
    if (!connection) throw new Error('offline');
    const meta = await connection.request<Record<string, unknown>>({ op: 'meta' });
    const own = typeof meta.contentBase === 'string' && /^https?:\/\//.test(meta.contentBase);
    return { found: true, data: { ...meta, contentBase: own ? meta.contentBase : liveContentBase } };
  }, [connection, liveContentBase]);

  const send = useCallback(
    (message: unknown) => {
      if (!connection) return;
      const selection = (message as { type?: unknown }).type === 'selection';
      connection.request(selection ? { op: 'selection', selection: message as never } : { op: 'client', message }).catch(() => {});
    },
    [connection],
  );

  return { presence, feed: { live: presence?.online ?? false, revision, load, send } };
}
