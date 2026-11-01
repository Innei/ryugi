import { renderThumbnail } from '../../shared/thumbnail';
import type { ArtifactSummary } from '../../shared/types';
import { artifactPath, resolveArtifactAddress } from '../artifact-address';
import { artifactKeyOf, isArtifactLocator, listArtifacts, resolveArtifactDir } from '../artifacts';
import { AVATAR_ROUTE } from '../avatars';
import { projectName, type ServerContext, titleOf } from '../context';
import { latestMtime } from '../html';
import { send, sendJson } from '../http';
import { publishPayload } from '../publish-payload';
import type { HttpRoute } from './table';

const API_ARTIFACT_ROUTE = /^\/api\/artifacts\/([^/]+)\/([^/]+)$/;
const API_PREVIEW_ROUTE = /^\/api\/preview\/([^/]+)\/([^/]+)$/;
const API_THUMBNAIL_ROUTE = /^\/api\/thumbnail\/([^/]+)\/([^/]+)\.svg$/;

export const listRoute: HttpRoute<ServerContext> = {
  path: '/api/artifacts',
  auth: 'viewer',
  handle: (_req, res, ctx) => {
    const { artifacts, warnings } = listArtifacts(ctx.root);
    const summaries: ArtifactSummary[] = artifacts.map((entry) => ({
      type: entry.type,
      id: entry.id,
      url: artifactPath(ctx.root, entry.type, entry.id),
      title: titleOf(ctx.readArtifact(entry.dir, entry)),
      updatedAt: latestMtime(entry.dir),
    }));
    sendJson(res, 200, {
      project: projectName(ctx),
      artifacts: summaries,
      warnings,
    });
  },
};

export const avatarRoute: HttpRoute<ServerContext> = {
  path: AVATAR_ROUTE,
  auth: 'viewer',
  handle: (_req, res, ctx, { match }) => {
    void ctx.avatars.load(match[1]!, match[2]!).then(({ status, type, body }) => {
      if (body && type)
        send(res, status, body, {
          'Content-Type': type,
          'Cache-Control': 'private, max-age=86400',
        });
      else send(res, status, 'No avatar');
    });
  },
};

export const previewApiRoute: HttpRoute<ServerContext> = {
  path: API_PREVIEW_ROUTE,
  auth: 'viewer',
  handle: (_req, res, ctx, { match }) => {
    const [, type = '', id = ''] = match;
    const dir = resolveArtifactDir(ctx.root, type, id);
    const ref = artifactKeyOf(`${type}/${id}`);
    if (!dir || !ref) {
      sendJson(res, 404, { error: 'Artifact not found' });
      return;
    }
    try {
      const payload = ctx.readArtifact(dir, ref);
      const title = titleOf(payload);
      sendJson(res, 200, {
        ...publishPayload(ref, dir, title, payload),
        title,
        warnings: payload.warnings,
        contentBase: `${ctx.contentPrefix}${type}/${id}/`,
      });
    } catch {
      sendJson(res, 422, { error: 'Preview unavailable' });
    }
  },
};

export const thumbnailRoute: HttpRoute<ServerContext> = {
  path: API_THUMBNAIL_ROUTE,
  auth: 'viewer',
  handle: (_req, res, ctx, { match }) => {
    const requested = artifactKeyOf(`${match[1]}/${match[2]}`, isArtifactLocator);
    let resolved: ReturnType<typeof resolveArtifactAddress>;
    try {
      resolved = requested && resolveArtifactAddress(ctx.root, requested.type, requested.id);
    } catch {
      resolved = null;
    }
    if (!resolved) {
      send(res, 404, 'Artifact not found');
      return;
    }
    try {
      const ref = { type: resolved.type, id: resolved.id };
      const payload = ctx.readArtifact(resolved.dir, ref);
      const title = titleOf(payload);
      const svg = renderThumbnail(
        { id: ref.id, type: ref.type, title, project: projectName(ctx) },
        ref.type === 'html' ? null : publishPayload(ref, resolved.dir, title, payload),
      );
      send(res, 200, svg, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'private, max-age=31536000, immutable',
        'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
        'X-Content-Type-Options': 'nosniff',
      });
    } catch {
      send(res, 422, 'Thumbnail unavailable');
    }
  },
};

export const artifactApiRoute: HttpRoute<ServerContext> = {
  path: API_ARTIFACT_ROUTE,
  auth: 'viewer',
  handle: (_req, res, ctx, { match }) => {
    const [, type = '', id = ''] = match;
    const dir = resolveArtifactDir(ctx.root, type, id);
    if (!dir) {
      sendJson(res, 404, { warnings: [`artifact ${type}/${id} not found`] });
      return;
    }
    const ref = artifactKeyOf(`${type}/${id}`)!;
    sendJson(res, 200, {
      ...ctx.artifactMeta(ref, dir),
      ...(ref.type === 'artboard' && ctx.boardPort
        ? {
            boardPort: ctx.boardPort,
            boardPath: `/c${artifactPath(ctx.root, 'artboard', ref.id)}/`,
          }
        : {}),
    });
  },
};
