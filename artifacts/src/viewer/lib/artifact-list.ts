import type { ArtifactSummary, ArtifactType } from '../../shared/types';

export type ArtifactSort = 'recent' | 'oldest' | 'name';

export function filterArtifacts(artifacts: ArtifactSummary[], type: ArtifactType | 'all', query: string, sort: ArtifactSort = 'recent') {
  const text = query.trim().toLocaleLowerCase();
  return artifacts
    .filter((artifact) => (type === 'all' || artifact.type === type) && `${artifact.title}\n${artifact.id}`.toLocaleLowerCase().includes(text))
    .sort((a, b) => {
      const order = sort === 'name' ? a.title.localeCompare(b.title) : (sort === 'oldest' ? 1 : -1) * (a.updatedAt - b.updatedAt);
      return order || `${a.type}/${a.id}`.localeCompare(`${b.type}/${b.id}`);
    });
}

const relative = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'always' });

export function relativeUpdatedAt(updatedAt: number, now = Date.now()) {
  const minutes = Math.floor(Math.max(0, now - updatedAt) / 60000);
  if (minutes === 0) return '刚刚';
  if (minutes < 60) return relative.format(-minutes, 'minute');
  if (minutes < 1440) return relative.format(-Math.floor(minutes / 60), 'hour');
  return relative.format(-Math.floor(minutes / 1440), 'day');
}
