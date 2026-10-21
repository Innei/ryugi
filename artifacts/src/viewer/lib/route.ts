import { isArtifactId, isArtifactType } from '../../shared/ids';
import type { ArtifactType } from '../../shared/types';

export type Route =
  | { kind: 'list' }
  | { kind: 'cloud-list' }
  | { kind: 'artifact'; type: ArtifactType; id: string }
  | { kind: 'preview'; type: ArtifactType; id: string }
  | { kind: 'cloud'; id: string }
  | { kind: 'cloud-view'; id: string }
  | { kind: 'cloud-preview'; id: string }
  | { kind: 'unknown' };

const CLOUD_ROUTE = /^\/a\/([A-Za-z0-9_-]{1,64})(\/view|\/preview)?\/?$/;

export function parseRoute(pathname: string, cloudHost = false): Route {
  if (pathname === '/' || pathname === '/index.html') return { kind: cloudHost ? 'cloud-list' : 'list' };
  const cloud = CLOUD_ROUTE.exec(pathname);
  if (cloud) return { kind: cloud[2] === '/view' ? 'cloud-view' : cloud[2] === '/preview' ? 'cloud-preview' : 'cloud', id: cloud[1]! };
  const preview = pathname.startsWith('/preview/');
  const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(preview ? pathname.slice('/preview'.length) : pathname);
  if (!match) return { kind: 'unknown' };
  const [, type = '', id = ''] = match;
  if (!isArtifactType(type) || !isArtifactId(id)) return { kind: 'unknown' };
  return { kind: preview ? 'preview' : 'artifact', type, id };
}
