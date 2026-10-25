import type { BoardHumanOp } from '../../shared/board-comments';
import type { BoardCommentsState } from './board-comments';

export interface ArtifactFeed {
  live: boolean;
  revision: number;
  load(): Promise<{ found: boolean; data: Record<string, unknown> }>;
  send(message: unknown): void;
  boardComments?: BoardCommentsState | null;
  comment?(op: BoardHumanOp): Promise<BoardCommentsState>;
}
