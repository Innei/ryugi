import { isArtifactId, isArtifactType } from '../../shared/ids';
import type { ArtifactType } from '../../shared/types';

export type Route =
  | { kind: 'list' }
  | { kind: 'artifact'; type: ArtifactType; id: string }
  | { kind: 'preview'; type: ArtifactType; id: string }
  | { kind: 'unknown' };

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '/index.html') return { kind: 'list' };
  const preview = pathname.startsWith('/preview/');
  const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(preview ? pathname.slice('/preview'.length) : pathname);
  if (!match) return { kind: 'unknown' };
  const [, type = '', id = ''] = match;
  if (!isArtifactType(type) || !isArtifactId(id)) return { kind: 'unknown' };
  return { kind: preview ? 'preview' : 'artifact', type, id };
}
