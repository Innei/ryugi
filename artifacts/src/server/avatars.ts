import { createHash } from 'node:crypto';

export const AVATAR_ROUTE = /^\/api\/avatar\/([a-z]+)\/([^/]+)$/;

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;

// Only ids that cannot change the upstream URL get through; the server never fetches a URL it was handed.
const SOURCES: Record<string, { valid: RegExp; url: (id: string) => string }> = {
  github: {
    valid: /^[A-Z0-9][A-Z0-9-]{0,38}$/i,
    url: (id) => `https://avatars.githubusercontent.com/${id}?s=64`,
  },
  gravatar: {
    valid: /^[0-9a-f]{64}$/,
    url: (id) => `https://gravatar.com/avatar/${id}?s=64&d=404`,
  },
};

export interface AvatarResult {
  body?: Buffer;
  status: number;
  type?: string;
}

export const githubAvatar = (login: string) => `/api/avatar/github/${login}`;

export const gravatarAvatar = (email: string) =>
  `/api/avatar/gravatar/${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`;

export function createAvatars(fetchImpl: typeof fetch = fetch) {
  const cache = new Map<string, Promise<AvatarResult>>();

  const fetchAvatar = async (url: string): Promise<AvatarResult> => {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !type.startsWith('image/')) return { status: 404 };
      const body = Buffer.from(await res.arrayBuffer());
      return body.length > MAX_BYTES ? { status: 404 } : { status: 200, type, body };
    } catch {
      return { status: 502 };
    }
  };

  return {
    load(source: string, id: string): Promise<AvatarResult> {
      const known = SOURCES[source];
      if (!known || !known.valid.test(id)) return Promise.resolve({ status: 404 });
      const key = `${source}/${id}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const pending = fetchAvatar(known.url(id)).then((result) => {
        if (result.status === 502) cache.delete(key);
        return result;
      });
      cache.set(key, pending);
      return pending;
    },
  };
}
