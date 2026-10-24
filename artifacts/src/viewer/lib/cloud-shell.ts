import { isVisibility, type Visibility } from '../../shared/cloud';
import { ARTIFACT_TYPES, type ArtifactType } from '../../shared/types';
import { i18n } from '../i18n';
import { errorText, isPlanLimit } from './error-text';

export { planLimitMessage } from './error-text';

export const INSTALL_URL = 'https://github.com/Innei/ryugi#install';
export const INSTALL_COMMAND = '/plugin marketplace add Innei/ryugi';

export type ShellState =
  | { kind: 'loading' }
  | { kind: 'ready'; type: ArtifactType | null; title: string; owner: boolean; visibility: Visibility; published: boolean; publishedAt: string | null }
  | { kind: 'missing'; login: string | null }
  | { kind: 'failed'; message: string };

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export interface PlanLimit {
  kind: 'private' | 'public' | 'total' | 'publishes';
  used: number;
  max: number;
}

export class CloudRequestError extends Error {
  constructor(readonly status: number, message: string, readonly limit?: PlanLimit, readonly upgradeUrl?: string) {
    super(message);
  }
}

export const loginUrl = (id: string) => `/auth/login?return=${encodeURIComponent(`/a/${id}`)}`;

async function requestError(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: unknown; code?: unknown; limit?: unknown; upgradeUrl?: unknown } | null;
  const message = errorText(body?.code, typeof body?.error === 'string' ? body.error : i18n.t('common.requestFailed', { status: res.status }));
  if (res.status !== 402 || body?.code !== 'plan_limit' || !isPlanLimit(body.limit)) return new CloudRequestError(res.status, message);
  return new CloudRequestError(res.status, message, body.limit, typeof body.upgradeUrl === 'string' ? body.upgradeUrl : '/billing');
}

export async function loadShell(id: string, fetchImpl: typeof fetch = fetch): Promise<Exclude<ShellState, { kind: 'loading' }>> {
  const res = await fetchImpl(`/api/a/${id}/meta`, { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) {
    const session = await fetchImpl('/api/session', { cache: 'no-store', credentials: 'same-origin' });
    const { login } = (await session.json().catch(() => ({ login: null }))) as { login?: unknown };
    return { kind: 'missing', login: typeof login === 'string' ? login : null };
  }
  if (!res.ok) return { kind: 'failed', message: i18n.t('common.loadFailed', { status: res.status }) };
  const artifact = (await res.json()) as { type?: unknown; title?: unknown; owner?: unknown; visibility?: unknown; published?: unknown; publishedAt?: unknown };
  const type = ARTIFACT_TYPES.find((type) => type === artifact.type) ?? null;
  return { kind: 'ready', type, title: typeof artifact.title === 'string' ? artifact.title : i18n.t('cloudShell.untitled'), owner: artifact.owner === true, visibility: isVisibility(artifact.visibility) ? artifact.visibility : 'private', published: artifact.published === true, publishedAt: typeof artifact.publishedAt === 'string' ? artifact.publishedAt : null };
}

export async function changeVisibility(id: string, visibility: Visibility, fetchImpl: typeof fetch = fetch): Promise<Visibility> {
  const res = await fetchImpl(`/api/a/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ visibility }),
    credentials: 'same-origin',
  });
  if (!res.ok) throw await requestError(res);
  const stored = ((await res.json()) as { visibility?: unknown }).visibility;
  return isVisibility(stored) ? stored : visibility;
}

export async function deleteCloudArtifact(id: string) {
  const res = await fetch(`/api/a/${id}`, { method: 'DELETE', headers: JSON_HEADERS, body: '{}', credentials: 'same-origin' });
  if (!res.ok && res.status !== 404) throw await requestError(res);
}

export async function switchAccount(id: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl('/auth/logout', { method: 'POST', headers: JSON_HEADERS, body: '{}', credentials: 'same-origin' });
  if (!res.ok && res.status !== 401) throw new Error((await requestError(res)).message);
  return `${loginUrl(id)}&switch=1`;
}
