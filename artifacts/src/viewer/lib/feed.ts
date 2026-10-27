import type { BoardHumanOp } from '../../shared/board-comments';
import type { BoardCommentsState } from './board-comments';

export interface ArtifactFeed {
  boardComments?: BoardCommentsState | null;
  comment?: (op: BoardHumanOp) => Promise<BoardCommentsState>;
  live: boolean;
  load: () => Promise<{ found: boolean; data: Record<string, unknown> }>;
  revision: number;
  send: (message: unknown) => void;
}
