export type Visibility = 'private' | 'public';

export interface CloudRecord {
  id: string;
  url: string;
  publishedAt: string | null;
  visibility: Visibility;
  fingerprint?: string;
}

export interface ArtifactConfig {
  visibility?: Visibility;
  cloud?: CloudRecord;
  autoPublish?: false;
}

export interface AutoPublishStatus {
  global: boolean | null;
  project: boolean | null;
  enabled: boolean;
}

export interface CloudStatus {
  signedIn: boolean;
  login: string | null;
  origin: string;
  artifacts: Record<string, ArtifactConfig>;
  autoPublish?: AutoPublishStatus;
  hostId?: string;
  warning: string | null;
}

export interface PublishState {
  published: boolean;
  visibility: Visibility;
  url: string | null;
  synced: boolean;
}

export const ownLink = (url: string, hostId?: string | null) => (hostId ? `${url}#ryugi-host=${hostId}` : url);

export const isVisibility = (value: unknown): value is Visibility => value === 'private' || value === 'public';

export function publishState(entry: ArtifactConfig | undefined): PublishState {
  const visibility = entry?.visibility ?? 'private';
  const cloud = entry?.cloud;
  const published = !!cloud?.publishedAt;
  return { published, visibility, url: published ? cloud.url : null, synced: !published || cloud.visibility === visibility };
}

export function syncNote(upToDate: boolean | null, autoFollow: boolean): string | null {
  if (upToDate === null) return null;
  if (upToDate) return '线上已是最新';
  return autoFollow ? '本地有未发布的修改，停止修改 5 分钟后自动更新' : '本地有未发布的修改';
}
