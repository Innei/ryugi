import type { BoardCommentsFile } from '../../shared/board-comments';

export interface BoardCommentsState {
  comments: BoardCommentsFile;
  stale: string[];
}

const isFile = (value: unknown): value is BoardCommentsFile =>
  typeof value === 'object' && value !== null && Array.isArray((value as { threads?: unknown }).threads);

const ids = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);

export function boardCommentsFromPayload(payload: Record<string, unknown>): BoardCommentsState | null {
  return isFile(payload.comments) ? { comments: payload.comments, stale: ids(payload.staleThreads) } : null;
}

export function boardCommentsFromMessage(message: unknown, artifact: string | null): BoardCommentsState | null {
  if (typeof message !== 'object' || message === null) return null;
  const m = message as Record<string, unknown>;
  if (m.type !== 'board-comments' || (artifact !== null && m.artifact !== artifact) || !isFile(m.comments)) return null;
  return { comments: m.comments, stale: ids(m.stale) };
}
