import type { ArtifactType } from '../../shared/types';
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
