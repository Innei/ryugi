import { useCallback, useState } from 'react';
import type { BoardHumanOp } from '../../shared/board-comments';
import type { ArtifactType } from '../../shared/types';
import { boardCommentsFromMessage, type BoardCommentsState } from '../lib/board-comments';
import { useArtifactSocket } from './useArtifactSocket';

export interface ArtifactFeed {
  live: boolean;
  revision: number;
  load(): Promise<{ found: boolean; data: Record<string, unknown> }>;
  send(message: unknown): void;
  boardComments?: BoardCommentsState | null;
  comment?(op: BoardHumanOp): Promise<BoardCommentsState>;
}

export function useLocalFeed(type: ArtifactType, id: string): ArtifactFeed {
  const [revision, setRevision] = useState(0);
  const [boardComments, setBoardComments] = useState<BoardCommentsState | null>(null);
  const bump = useCallback(() => setRevision((current) => current + 1), []);
  const { live, send } = useArtifactSocket((message) => {
    if (message.type === 'change' && message.artifact === `${type}/${id}`) bump();
    const comments = boardCommentsFromMessage(message, `${type}/${id}`);
    if (comments) setBoardComments(comments);
  }, bump);
  const load = useCallback(async () => {
    const res = await fetch(`/api/artifacts/${type}/${id}`, { cache: 'no-store' });
    return { found: res.ok, data: (await res.json()) as Record<string, unknown> };
  }, [type, id]);
  const comment = useCallback(async (op: BoardHumanOp) => {
    const res = await fetch(`/api/artboard/${id}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op) });
    if (!res.ok) throw new Error(`comment failed (${res.status})`);
    const next = (await res.json()) as BoardCommentsState;
    setBoardComments(next);
    return next;
  }, [id]);
  return { live, revision, load, send, ...(type === 'artboard' ? { boardComments, comment } : {}) };
}
