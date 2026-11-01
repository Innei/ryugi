import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';

import type { ArtifactType } from '../../shared/types';
import { hostAllowed } from '../access';
import { resolveArtifactAddress } from '../artifact-address';
import { artifactKeyOf, resolveArtifactDir } from '../artifacts';
import { boardCsp, routeBoardRequest } from '../board-port';
import type { ServerContext } from '../context';
import { send, sendFile, sendJson } from '../http';
import { injectRuntime } from '../inject';
import { resolveBoardFile, resolveDocumentAsset, resolveHtmlFile, resolveInside } from '../paths';
import type { HttpRoute } from './table';

const CONTENT_CSP: Record<ArtifactType, string> = {
  artboard: 'sandbox allow-scripts',
  document: "sandbox; default-src 'none'",
  html: 'sandbox allow-scripts allow-modals allow-forms allow-popups allow-downloads',
};

export function serveContent(
  ctx: ServerContext,
  res: http.ServerResponse,
  rest: string,
  range?: string,
  mode: 'main' | 'board' = 'main',
) {
  const { root, runtimeDir, recordings, options } = ctx;
  if (rest.startsWith('runtime/')) {
    if (!runtimeDir) {
      send(res, 404, 'Not found');
      return;
    }
    const relative = rest.slice('runtime/'.length);
    const target = resolveInside(runtimeDir, relative);
    if (!target) {
      send(res, 403, 'Forbidden');
      return;
    }
    sendFile(res, target, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    });
    return;
  }
  const [type = '', id = '', ...parts] = rest.split('/');
  const dir = resolveArtifactDir(root, type, id);
  if (!dir) {
    send(res, 404, 'Not found');
    return;
  }
  const ref = artifactKeyOf(`${type}/${id}`)!;
  const relative = parts.join('/');
  if (!resolveInside(dir, relative)) {
    send(res, 403, 'Forbidden');
    return;
  }
  const resolve = {
    artboard: resolveBoardFile,
    document: resolveDocumentAsset,
    html: resolveHtmlFile,
  }[ref.type];
  const target =
    (ref.type === 'artboard' ? recordings.resolve(id, relative) : null) ?? resolve(dir, relative);
  if (!target) {
    send(res, 404, 'Not found');
    return;
  }
  const page = ref.type === 'html' ? relative === 'index.html' : relative.endsWith('.html');
  const headers = {
    'Content-Security-Policy':
      mode === 'board'
        ? boardCsp(options.urlHost, ctx.port, options.cloud?.origin)
        : CONTENT_CSP[page && ref.type === 'document' ? 'html' : ref.type],
    ...(mode === 'board' ? {} : { 'Access-Control-Allow-Origin': '*' }),
  };
  if (!page) {
    sendFile(res, target, headers, range);
    return;
  }
  fs.readFile(target, 'utf8', (err, source) => {
    if (err) send(res, 404, 'Not found');
    else {
      const uiRuntimeUrl = runtimeDir
        ? `${mode === 'board' ? '/c/' : ctx.contentPrefix}runtime/ryugi-ui.js`
        : undefined;
      send(
        res,
        200,
        injectRuntime(source, {
          uiRuntimeUrl,
          embedded: ref.type === 'document',
          inspector: ref.type === 'artboard',
        }),
        { 'Content-Type': 'text/html; charset=utf-8', ...headers },
      );
    }
  });
}

export const statusRoute: HttpRoute<ServerContext> = {
  path: '/api/status',
  // The monitor polls this; counting it as activity would keep every watched server from ever going idle.
  raw: true,
  auth: 'key',
  handle: (_req, res, ctx) => {
    sendJson(res, 200, {
      pid: process.pid,
      startedAt: ctx.startedAt,
      lastActivity: ctx.lastActivity,
      clients: ctx.clients.size,
    });
  },
};

export const robotsRoute: HttpRoute<ServerContext> = {
  path: '/robots.txt',
  auth: 'public',
  handle: (_req, res, ctx) => {
    sendFile(res, path.join(ctx.viewerDir, 'robots.txt'));
  },
};

export const contentRoute: HttpRoute<ServerContext> = {
  path: /^\/c\//,
  auth: 'public',
  handle: (req, res, ctx, { pathname }) => {
    if (!pathname.startsWith(ctx.contentPrefix)) send(res, 404, 'Not found');
    else serveContent(ctx, res, pathname.slice(ctx.contentPrefix.length), req.headers.range);
  },
};

export const createBoardRequestHandler =
  (ctx: ServerContext) => (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (!hostAllowed(ctx.policy, req.headers.host)) {
      send(res, 403, 'Forbidden host');
      return;
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://board.local').pathname);
    } catch {
      send(res, 400, 'Bad request');
      return;
    }
    try {
      const route = routeBoardRequest(req, pathname);
      if (route.kind === 'robots') send(res, 200, 'User-agent: *\nDisallow: /\n');
      else if (route.kind === 'runtime')
        serveContent(ctx, res, route.rest, req.headers.range, 'board');
      else if (route.kind === 'board') {
        const resolved = resolveArtifactAddress(ctx.root, 'artboard', route.address);
        if (!resolved || resolved.id === route.address) send(res, 404, 'Not found');
        else
          serveContent(
            ctx,
            res,
            `artboard/${resolved.id}/${route.rest}`,
            req.headers.range,
            'board',
          );
      } else send(res, 404, 'Not found');
    } catch (err) {
      if (!res.headersSent) send(res, 500, (err as Error).message);
      else res.destroy();
    }
  };
