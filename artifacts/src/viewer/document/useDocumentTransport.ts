import { useEffect, useMemo, useState } from 'react';
import type { RelayPresence } from '../../shared/relay';
import { useArtifactSocket } from '../hooks/useArtifactSocket';
import { createChannel } from './channel';
import { relayUrlFor } from '../hooks/useCloudFeed';
import { knownHosts } from '../lib/knownHosts';
import { createLiveConnection } from '../lib/liveConnection';
import { createLocalTransport, createRelayTransport, type DocumentTransport } from './transport';

export function useLocalTransport(id: string) {
  const channel = useMemo(createChannel, []);
  const artifact = `document/${id}`;
  const { live, send } = useArtifactSocket(
    (message) => {
      if (message.artifact === artifact) channel.emit(message);
    },
    () => channel.emit({ type: 'open' }),
  );
  const transport = useMemo(() => createLocalTransport({ id, channel, send }), [id, channel, send]);
  return { transport, live };
}

export function useRelayTransport(cloudId: string, contentBase: string) {
  const [transport, setTransport] = useState<DocumentTransport | null>(null);
  const [presence, setPresence] = useState<RelayPresence | null>(null);

  useEffect(() => {
    const relay = createRelayTransport({
      url: relayUrlFor(cloudId),
      artifact: `document/${cloudId}`,
      contentBase,
      onPresence: setPresence,
      connect: (options) => createLiveConnection({ ...options, cloudId, known: knownHosts() }),
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
