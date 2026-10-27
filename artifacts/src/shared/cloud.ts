export type Visibility = 'private' | 'public';

export interface PlanLimit {
  kind: 'private' | 'public' | 'total' | 'publishes';
  used: number;
  max: number;
}

export interface Publication {
  phase:
    'waiting' | 'preparing' | 'uploading' | 'publishing' | 'not-ready' | 'failed' | 'published';
  publishedAt: string | null;
  autoPublish: boolean;
  reasons?: string[];
  message?: string;
}

export const publishing = (phase: Publication['phase']) =>
  phase === 'preparing' || phase === 'uploading' || phase === 'publishing';

export function readPublication(value: unknown): Publication | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (
    typeof p.phase !== 'string' ||
    ![
      'waiting',
      'preparing',
      'uploading',
      'publishing',
      'not-ready',
      'failed',
      'published',
    ].includes(p.phase)
  )
    return null;
  if (
    p.publishedAt !== null &&
    (typeof p.publishedAt !== 'string' || !Number.isFinite(Date.parse(p.publishedAt)))
  )
    return null;
  if (
    typeof p.autoPublish !== 'boolean' ||
    (p.message !== undefined && typeof p.message !== 'string')
  )
    return null;
  if (
    p.reasons !== undefined &&
    (!Array.isArray(p.reasons) || !p.reasons.every((reason) => typeof reason === 'string'))
  )
    return null;
  return p as unknown as Publication;
}

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

export const ownLink = (url: string, hostId?: string | null) =>
  hostId ? `${url}#ryugi-host=${hostId}` : url;

export const isVisibility = (value: unknown): value is Visibility =>
  value === 'private' || value === 'public';

export function publishState(entry: ArtifactConfig | undefined): PublishState {
  const visibility = entry?.visibility ?? 'private';
  const cloud = entry?.cloud;
  const published = !!cloud?.publishedAt;
  return {
    published,
    visibility,
    url: published ? cloud.url : null,
    synced: !published || cloud.visibility === visibility,
  };
}

export type SyncNote = 'upToDate' | 'localChanges' | 'localChangesAuto';

export function syncNote(upToDate: boolean | null, autoFollow: boolean): SyncNote | null {
  if (upToDate === null) return null;
  if (upToDate) return 'upToDate';
  return autoFollow ? 'localChangesAuto' : 'localChanges';
}
