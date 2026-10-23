export const ARTIFACT_TYPES = ['artboard', 'document', 'html'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PageSpec {
  id: string;
  name: string;
}

export const BOARD_TYPES = ['html', 'image', 'video'] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

export interface BoardSpec extends Rect {
  file: string;
  page: string;
  type?: BoardType;
  src?: string;
  title?: string;
  interactive?: boolean;
}

export const isMediaBoard = (board: { type?: unknown }): board is { type: 'image' | 'video' } => board.type === 'image' || board.type === 'video';

export interface GroupSpec {
  title?: string;
  boards: string[];
  verify?: boolean;
}

export interface NoteSpec {
  page: string;
  kind: 'title' | 'sticky';
  x: number;
  y: number;
  text: string;
  w?: number;
  size?: number;
  color?: string;
}

export interface FocusSpec {
  target: string;
  at: string;
}

export interface CanvasSpec {
  version: number;
  title?: string;
  activePage?: string;
  focus?: FocusSpec;
  building?: boolean;
  writing?: string;
  pages: PageSpec[];
  boards: Record<string, BoardSpec>;
  groups?: Record<string, GroupSpec>;
  notes?: Record<string, NoteSpec>;
}

export interface PageLayout {
  groups: Record<string, Rect>;
  notes: Record<string, Rect>;
  bounds: Bounds | null;
}

export interface CanvasLayout {
  pages: Record<string, PageLayout>;
}

export interface CanvasPayload {
  agent?: string;
  canvas: CanvasSpec | null;
  warnings: string[];
  pending: string[];
  layout: CanvasLayout | null;
  versions: Record<string, number>;
}

export interface HtmlPayload {
  title: string;
  warnings: string[];
  version: number;
}

export interface DocumentPayload {
  agent?: string;
  title: string;
  warnings: string[];
  version: number;
}

export interface ArtifactSummary {
  type: ArtifactType;
  id: string;
  title: string;
  updatedAt: number;
}

import type { BoardCommentsFile } from './board-comments';
import type { CommentsFile } from './comments';

export type DocumentOutcomeMessage =
  | { kind: 'idle' }
  | { kind: 'merged'; stats: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'failed'; message: string };

export type ServerMessage =
  | { type: 'change'; artifact: string; files: string[] }
  | { type: 'doc-update'; artifact: string; bytes: string }
  | { type: 'doc-cursor'; artifact: string; cursor: { id: string; offset: number } | null }
  | { type: 'doc-status'; artifact: string; streaming: boolean; outcome: DocumentOutcomeMessage; agentActiveAt: number; now: number }
  | { type: 'doc-comments'; artifact: string; comments: CommentsFile }
  | { type: 'board-comments'; artifact: string; comments: BoardCommentsFile; stale: string[] }
  | { type: 'cloud-published'; artifact: string };
