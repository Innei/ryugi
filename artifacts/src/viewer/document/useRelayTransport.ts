import { useEffect, useState } from 'react';
import type { RelayPresence } from '../../shared/relay';
import { relayUrlFor } from '../hooks/useCloudFeed';
import { knownHosts } from '../lib/knownHosts';
import { createLiveConnection } from '../lib/liveConnection';
import { connectPublication } from '../lib/cloud-publication';
import { createRelayTransport, type DocumentTransport } from './transport';

export function useRelayTransport(cloudId: string, contentBase: string) {
  const [transport, setTransport] = useState<DocumentTransport | null>(null);
  const [presence, setPresence] = useState<RelayPresence | null>(null);

  useEffect(() => {
    const relay = createRelayTransport({
      url: relayUrlFor(cloudId),
      artifact: `document/${cloudId}`,
      contentBase,
      onPresence: setPresence,
      connect: (options) => connectPublication(cloudId, options, (next) => createLiveConnection({ ...next, cloudId, known: knownHosts() })),
    });
    setTransport(relay);
    return () => {
      relay.close();
      setTransport(null);
      setPresence(null);
    };
  }, [cloudId, contentBase]);

  return { transport, presence };
}
