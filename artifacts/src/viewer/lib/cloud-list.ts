import type { SerializedEditorState } from 'lexical';
import type { ArtifactType, CanvasPayload } from '../../shared/types';
import type { Visibility } from '../../shared/cloud';
import { isArtifactType } from '../../shared/ids';

export interface CloudListItem {
  id: string;
  type: ArtifactType;
  title: string | null;
  project: string | null;
  visibility: Visibility;
  url: string;
  version: number | null;
  updatedAt: string;
  createdAt?: string;
  storageBytes?: number;
  files?: number;
  versions?: number;
  onProfile?: boolean;
}

export interface DailyViews {
  days: { day: string; views: number }[];
  total: number;
}

export const isDailyViews = (value: unknown): value is DailyViews => {
  const views = value as DailyViews | null;
  return Array.isArray(views?.days) && typeof views.total === 'number' && views.days.every((day) => typeof day?.views === 'number');
};

export function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : Number(value.toFixed(1))} ${units[unit]}`;
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

export function filterFromSearch(search: string): CloudFilter {
  const params = new URLSearchParams(search);
  const filter: CloudFilter = {};
  const project = params.get('project');
  if (project !== null) filter.project = project || null;
  const visibility = params.get('visibility');
  if (visibility === 'public' || visibility === 'private') filter.visibility = visibility;
  const type = params.get('type');
  if (type && isArtifactType(type)) filter.type = type;
  return filter;
}

export function filterSearch({ project, visibility, type }: CloudFilter) {
  const params = new URLSearchParams();
  if (project !== undefined) params.set('project', project ?? '');
  if (visibility) params.set('visibility', visibility);
  if (type) params.set('type', type);
  const search = params.toString();
  return search ? `?${search}` : '';
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
