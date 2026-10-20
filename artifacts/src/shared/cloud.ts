export type Visibility = 'private' | 'public';

export interface CloudRecord {
  id: string;
  url: string;
  publishedAt: string;
  visibility: Visibility;
}

export interface ArtifactConfig {
  visibility?: Visibility;
  cloud?: CloudRecord;
}

export interface CloudStatus {
  signedIn: boolean;
  login: string | null;
  origin: string;
  artifacts: Record<string, ArtifactConfig>;
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
  return { published: !!cloud, visibility, url: cloud?.url ?? null, synced: !cloud || cloud.visibility === visibility };
}
