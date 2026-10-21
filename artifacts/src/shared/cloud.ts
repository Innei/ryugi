export type Visibility = 'private' | 'public';

export interface CloudRecord {
  id: string;
  url: string;
  publishedAt: string | null;
  visibility: Visibility;
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
  warning: string | null;
}

export interface PublishState {
  published: boolean;
  visibility: Visibility;
  url: string | null;
  synced: boolean;
}

export const isVisibility = (value: unknown): value is Visibility => value === 'private' || value === 'public';

export function publishState(entry: ArtifactConfig | undefined): PublishState {
  const visibility = entry?.visibility ?? 'private';
  const cloud = entry?.cloud;
  const published = !!cloud?.publishedAt;
  return { published, visibility, url: published ? cloud.url : null, synced: !published || cloud.visibility === visibility };
}
