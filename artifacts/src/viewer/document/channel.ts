import type { ServerMessage } from '../../shared/types';

export type ChannelEvent = ServerMessage | { type: 'open' };

export interface Channel {
  emit(event: ChannelEvent): void;
  subscribe(listener: (event: ChannelEvent) => void): () => void;
}

export function createChannel(): Channel {
  const listeners = new Set<(event: ChannelEvent) => void>();
  return {
    emit: (event) => listeners.forEach((listener) => listener(event)),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
