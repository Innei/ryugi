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

export interface BoardSpec extends Rect {
  file: string;
  page: string;
  title?: string;
}

export interface GroupSpec {
  title?: string;
  boards: string[];
}

export interface NoteSpec {
  page: string;
  kind: 'title' | 'sticky';
  x: number;
  y: number;
  text: string;
  w?: number;
  size?: number;
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
  canvas: CanvasSpec | null;
  warnings: string[];
  layout: CanvasLayout | null;
  versions: Record<string, number>;
}

export interface HtmlPayload {
  title: string;
  warnings: string[];
  version: number;
}

export interface DocumentPayload {
  title: string;
  warnings: string[];
  version: number;
}

export interface ArtifactSummary {
  type: ArtifactType;
  id: string;
  title: string;
}

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
  | { type: 'doc-status'; artifact: string; streaming: boolean; outcome: DocumentOutcomeMessage }
  | { type: 'doc-comments'; artifact: string; comments: CommentsFile };
