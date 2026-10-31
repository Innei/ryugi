import { isArtifactLocator, isArtifactType } from '../../shared/ids';
import type { ArtifactType } from '../../shared/types';

export type Route =
  | { kind: 'list' }
  | { kind: 'artifact'; type: ArtifactType; id: string }
  | { kind: 'preview'; type: ArtifactType; id: string }
  | { kind: 'embed'; type: 'artboard'; id: string }
  | { kind: 'unknown' };

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '/index.html') return { kind: 'list' };
  const embed = /^\/embed\/artboard\/([\w-]{1,64})\/?$/.exec(pathname);
  if (embed) return { kind: 'embed', type: 'artboard', id: embed[1]! };
  if (pathname.startsWith('/embed/')) return { kind: 'unknown' };
  const preview = pathname.startsWith('/preview/');
  const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(
    preview ? pathname.slice('/preview'.length) : pathname,
  );
  if (!match) return { kind: 'unknown' };
  const [, type = '', id = ''] = match;
  if (!isArtifactType(type) || !isArtifactLocator(id)) return { kind: 'unknown' };
  return { kind: preview ? 'preview' : 'artifact', type, id };
}

export const canonicalPath = (pathname: string, canonical: string) =>
  pathname.startsWith('/embed/') ? `/embed${canonical}` : canonical;
