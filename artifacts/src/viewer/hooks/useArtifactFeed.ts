import { useCallback, useState } from 'react';
import type { ArtifactType } from '../../shared/types';
import { useArtifactSocket } from './useArtifactSocket';

export interface ArtifactFeed {
  live: boolean;
  revision: number;
  load(): Promise<{ found: boolean; data: Record<string, unknown> }>;
  send(message: unknown): void;
}

export function useLocalFeed(type: ArtifactType, id: string): ArtifactFeed {
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision((current) => current + 1), []);
  const { live, send } = useArtifactSocket((message) => {
    if (message.type === 'change' && message.artifact === `${type}/${id}`) bump();
  }, bump);
  const load = useCallback(async () => {
    const res = await fetch(`/api/artifacts/${type}/${id}`, { cache: 'no-store' });
    return { found: res.ok, data: (await res.json()) as Record<string, unknown> };
  }, [type, id]);
  return { live, revision, load, send };
}
