import type { SerializedEditorState } from 'lexical';
import type { ArtifactType, CanvasPayload } from '../../shared/types';
import type { Visibility } from '../../shared/cloud';

export interface CloudListItem {
  id: string;
  type: ArtifactType;
  title: string | null;
  project: string | null;
  visibility: Visibility;
  url: string;
  version: number | null;
  updatedAt: string;
}

export interface CloudListGroup {
  project: string | null;
  artifacts: CloudListItem[];
}

const newestFirst = (a: CloudListItem, b: CloudListItem) => b.updatedAt.localeCompare(a.updatedAt);

export function groupByProject(items: CloudListItem[]): CloudListGroup[] {
  const groups = new Map<string | null, CloudListItem[]>();
  for (const item of items) {
    if (item.version === null) continue;
    groups.set(item.project, [...(groups.get(item.project) ?? []), item]);
  }
  return [...groups]
    .map(([project, artifacts]) => ({ project, artifacts: artifacts.sort(newestFirst) }))
    .sort((a, b) => (a.project === null ? 1 : b.project === null ? -1 : newestFirst(a.artifacts[0]!, b.artifacts[0]!)));
}

export interface CloudFilter {
  project?: string | null;
  visibility?: Visibility;
  type?: ArtifactType;
}

export const publishedNewestFirst = (items: CloudListItem[]) => items.filter((item) => item.version !== null).sort(newestFirst);

export const projectCounts = (items: CloudListItem[]) => groupByProject(items).map(({ project, artifacts }) => ({ project, count: artifacts.length }));

export const filterCloudItems = (items: CloudListItem[], { project, visibility, type }: CloudFilter) => items.filter((item) =>
  (project === undefined || item.project === project) && (!visibility || item.visibility === visibility) && (!type || item.type === type));

export type CloudArtifactData =
  | { type: 'html'; title: string; contentBase: string; payload: { title: string } }
  | { type: 'artboard'; title: string; contentBase: string; payload: Pick<CanvasPayload, 'canvas' | 'layout' | 'versions'> }
  | { type: 'document'; title: string; contentBase: string; payload: { title: string; state: SerializedEditorState } };

export function cloudPreviewPayload(artifact: CloudArtifactData) {
  const base = { title: artifact.title, contentBase: artifact.contentBase };
  if (artifact.type === 'artboard') {
    const { canvas, layout, versions } = artifact.payload;
    return { ...base, canvas, layout, versions, pending: [] };
  }
  if (artifact.type === 'document') return { ...base, state: artifact.payload.state };
  return base;
}
