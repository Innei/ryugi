import { isVisibility, type Visibility } from '../../shared/cloud';
import { ARTIFACT_TYPES, type ArtifactType } from '../../shared/types';

export const INSTALL_URL = 'https://github.com/Innei/ryugi#install';
export const INSTALL_COMMAND = '/plugin marketplace add Innei/ryugi';

export type ShellState =
  | { kind: 'loading' }
  | { kind: 'ready'; type: ArtifactType | null; title: string; owner: boolean; visibility: Visibility }
  | { kind: 'missing'; login: string | null }
  | { kind: 'failed'; message: string };

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class CloudRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const loginUrl = (id: string) => `/auth/login?return=${encodeURIComponent(`/a/${id}`)}`;

async function errorOf(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === 'string' ? body.error : `请求失败（${res.status}）`;
}

export async function loadShell(id: string, fetchImpl: typeof fetch = fetch): Promise<Exclude<ShellState, { kind: 'loading' }>> {
  const res = await fetchImpl(`/api/a/${id}`, { cache: 'no-store', credentials: 'same-origin' });
  if (res.status === 404) {
    const session = await fetchImpl('/api/session', { cache: 'no-store', credentials: 'same-origin' });
    const { login } = (await session.json().catch(() => ({ login: null }))) as { login?: unknown };
    return { kind: 'missing', login: typeof login === 'string' ? login : null };
  }
  if (!res.ok) return { kind: 'failed', message: `加载失败（${res.status}）` };
  const artifact = (await res.json()) as { type?: unknown; title?: unknown; owner?: unknown; visibility?: unknown };
  const type = ARTIFACT_TYPES.find((type) => type === artifact.type) ?? null;
  return { kind: 'ready', type, title: typeof artifact.title === 'string' ? artifact.title : '还没发布', owner: artifact.owner === true, visibility: isVisibility(artifact.visibility) ? artifact.visibility : 'private' };
}

export async function changeVisibility(id: string, visibility: Visibility, fetchImpl: typeof fetch = fetch): Promise<Visibility> {
  const res = await fetchImpl(`/api/a/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ visibility }),
    credentials: 'same-origin',
  });
  if (!res.ok) throw new CloudRequestError(res.status, await errorOf(res));
  const stored = ((await res.json()) as { visibility?: unknown }).visibility;
  return isVisibility(stored) ? stored : visibility;
}

export async function deleteCloudArtifact(id: string) {
  const res = await fetch(`/api/a/${id}`, { method: 'DELETE', headers: JSON_HEADERS, body: '{}', credentials: 'same-origin' });
  if (!res.ok && res.status !== 404) throw new CloudRequestError(res.status, await errorOf(res));
}

export async function switchAccount(id: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl('/auth/logout', { method: 'POST', headers: JSON_HEADERS, body: '{}', credentials: 'same-origin' });
  if (!res.ok && res.status !== 401) throw new Error(await errorOf(res));
  return `${loginUrl(id)}&switch=1`;
}
