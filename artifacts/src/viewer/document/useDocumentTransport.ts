import { useMemo } from 'react';
import { useArtifactSocket } from '../hooks/useArtifactSocket';
import { createChannel } from './channel';
import { createLocalTransport } from './transport';

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
