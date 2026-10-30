import type { BoardCommentsFile } from './board-comments';
import type { CommentsFile } from './comments';

export const ARTIFACT_TYPES = ['artboard', 'document', 'html'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface Rect {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface Bounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

export interface PageSpec {
  id: string;
  name: string;
}

export const BOARD_TYPES = ['html', 'image', 'video'] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

export interface BoardSpec extends Rect {
  file: string;
  interactive?: boolean;
  page: string;
  src?: string;
  title?: string;
  trim?: boolean;
  type?: BoardType;
}

export const isMediaBoard = (board: { type?: unknown }): board is { type: 'image' | 'video' } =>
  board.type === 'image' || board.type === 'video';

export interface GroupSpec {
  boards: string[];
  title?: string;
  verify?: boolean;
}

export interface NoteSpec {
  color?: string;
  kind: 'title' | 'sticky';
  page: string;
  size?: number;
  text: string;
  w?: number;
  x: number;
  y: number;
}

export interface FocusSpec {
  at: string;
  target: string;
}

export interface CanvasSpec {
  activePage?: string;
  boards: Record<string, BoardSpec>;
  building?: boolean;
  focus?: FocusSpec;
  groups?: Record<string, GroupSpec>;
  notes?: Record<string, NoteSpec>;
  pages: PageSpec[];
  title?: string;
  version: number;
  writing?: string;
}

export interface PageLayout {
  bounds: Bounds | null;
  groups: Record<string, Rect>;
  notes: Record<string, Rect>;
}

export interface CanvasLayout {
  pages: Record<string, PageLayout>;
}

export interface CanvasPayload {
  agent?: string;
  canvas: CanvasSpec | null;
  layout: CanvasLayout | null;
  pending: string[];
  recordings?: Record<string, RecordingState>;
  versions: Record<string, number>;
  warnings: string[];
}

export interface RecordingState {
  duration?: number;
  end?: number;
  outcome?: 'trimmed' | 'unchanged' | 'no-motion';
  removed?: number;
  start?: number;
  status: 'processing' | 'ready' | 'original';
  warning?: string;
}

export interface HtmlPayload {
  title: string;
  version: number;
  warnings: string[];
}

export interface DocumentPayload {
  agent?: string;
  title: string;
  version: number;
  warnings: string[];
}

export interface ArtifactSummary {
  id: string;
  title: string;
  type: ArtifactType;
  updatedAt: number;
  url?: string;
}

export type DocumentOutcomeMessage =
  | { kind: 'idle' }
  | { kind: 'merged'; stats: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'failed'; message: string };

export type ServerMessage =
  | { type: 'cloud-publication'; artifact: string; publication: import('./cloud').Publication }
  | { type: 'change'; artifact: string; files: string[] }
  | { type: 'doc-update'; artifact: string; bytes: string }
  | { type: 'doc-cursor'; artifact: string; cursor: { id: string; offset: number } | null }
  | {
      type: 'doc-status';
      artifact: string;
      streaming: boolean;
      outcome: DocumentOutcomeMessage;
      agentActiveAt: number;
      now: number;
    }
  | { type: 'doc-comments'; artifact: string; comments: CommentsFile }
  | { type: 'board-comments'; artifact: string; comments: BoardCommentsFile; stale: string[] }
  | { type: 'cloud-published'; artifact: string };
