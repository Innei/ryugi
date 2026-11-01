import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';

import { ARTIFACT_LOCATOR_SOURCE } from '../../shared/ids';
import { parseAcceptLanguage, resolveLocale } from '../../shared/locale';
import { typeFaviconHref } from '../../shared/type-icons';
import { ARTIFACT_TYPES } from '../../shared/types';
import { artifactPath, resolveArtifactAddress } from '../artifact-address';
import { artifactKeyOf, type ArtifactRef, isArtifactLocator } from '../artifacts';
import { projectName, type ServerContext, titleOf } from '../context';
import { send, sendFile, urlHostForHttp } from '../http';
import { serverText } from '../locales';
import { resolveInside } from '../paths';
import { allowInlineScripts, viewerPage } from '../viewer-page';
import type { HttpRoute, RouteParams } from './table';

const SHELL_ROUTE = new RegExp(`^/(?:(${ARTIFACT_TYPES.join('|')})/([^/]+)/?)?$`);
const PREVIEW_ROUTE = new RegExp(
  `^/preview/(artboard|document|html)/${ARTIFACT_LOCATOR_SOURCE}/?$`,
);
const EMBED_ROUTE = /^\/embed\/(artboard|document)\/([\w-]{1,64})\/?$/;

const viewerCsp = (boardOrigins: string[]) =>
  [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${boardOrigins.join(' ')}`,
    `frame-src 'self' ${boardOrigins.join(' ')}`,
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

function serveShell(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: ServerContext,
  { pathname, key }: RouteParams,
  embedded: ArtifactRef | null,
) {
  const { root, options, loopback, viewerDir } = ctx;
  const embed = embedded !== null;
  const requested =
    embedded ||
    artifactKeyOf(pathname.replace(/^\/(?:preview\/)?/, '').replace(/\/$/, ''), isArtifactLocator);
  const resolved = requested && resolveArtifactAddress(root, requested.type, requested.id);
  const ref = resolved ?? requested;
  const dir = resolved?.dir;
  const project = projectName(ctx);
  const title = ref
    ? dir
      ? titleOf(ctx.readArtifact(dir, ref))
      : ref.id
    : `${project} · Artifacts`;
  const locale = resolveLocale(parseAcceptLanguage(req.headers['accept-language']));
  const t = serverText(locale);
  const description = ref
    ? t('meta.artifact', {
        project,
        title,
        type: ref.type === 'artboard' ? 'Artboard' : ref.type === 'document' ? 'Document' : 'HTML',
      })
    : t('meta.library', { project });
  const preview = PREVIEW_ROUTE.test(pathname);
  const canonicalPath = ref
    ? dir
      ? artifactPath(root, ref.type, ref.id)
      : `/${ref.type}/${ref.id}`
    : '/';
  const canonical = `http://${urlHostForHttp(options.urlHost)}:${ctx.port}${preview ? '/preview' : ''}${canonicalPath}`;
  const csp = embed
    ? viewerCsp(ctx.boardOrigins()).replace(
        "frame-ancestors 'none'",
        `frame-ancestors ${options.cloud!.origin}`,
      )
    : preview
      ? viewerCsp(ctx.boardOrigins()).replace("frame-ancestors 'none'", "frame-ancestors 'self'")
      : viewerCsp(ctx.boardOrigins());
  const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' };
  // One server serves every project: the page's own calls (/api/artifacts, /api/cloud/*) find their project by the Referer.
  if (ref) headers['Referrer-Policy'] = 'same-origin';
  if (key !== null && !loopback)
    headers['Set-Cookie'] = `${ctx.cookieName}=${ctx.token}; HttpOnly; SameSite=Strict; Path=/`;
  const entry =
    preview && fs.existsSync(path.join(viewerDir, 'preview.html')) ? 'preview.html' : 'index.html';
  void fs.promises
    .readFile(path.join(viewerDir, entry), 'utf8')
    .then((template) => {
      const html = viewerPage(template, {
        title,
        description,
        locale,
        url: canonical,
        icon: ref ? typeFaviconHref(ref.type) : undefined,
        artifactId: resolved?.id,
        embedParent: embed ? options.cloud!.origin : undefined,
      });
      send(res, 200, html, {
        ...headers,
        'Content-Security-Policy': allowInlineScripts(csp, html),
      });
    })
    .catch((err: NodeJS.ErrnoException) =>
      send(res, err.code === 'ENOENT' ? 404 : 500, 'Viewer unavailable'),
    );
}

export const embedRoute: HttpRoute<ServerContext> = {
  path: /^\/embed\//,
  auth: 'viewer',
  handle: (req, res, ctx, params) => {
    const embedMatch = EMBED_ROUTE.exec(params.pathname);
    const embedded =
      embedMatch && ctx.embedTarget(embedMatch[1] as 'artboard' | 'document', embedMatch[2]!);
    if (!embedded || !ctx.options.cloud) send(res, 404, 'Not found');
    else serveShell(req, res, ctx, params, embedded);
  },
};

export const libraryRoute: HttpRoute<ServerContext> = {
  path: (pathname) => (pathname === '/' || pathname === '/index.html' ? [pathname] : null),
  auth: 'navigation',
  handle: (req, res, ctx, params) => serveShell(req, res, ctx, params, null),
};

export const shellRoute: HttpRoute<ServerContext> = {
  path: (pathname) => SHELL_ROUTE.exec(pathname) ?? PREVIEW_ROUTE.exec(pathname),
  auth: 'viewer',
  handle: (req, res, ctx, params) => serveShell(req, res, ctx, params, null),
};

export const viewerFileRoute: HttpRoute<ServerContext> = {
  path: (pathname) => [pathname],
  auth: 'viewer',
  handle: (_req, res, ctx, { pathname }) => {
    const target = resolveInside(ctx.viewerDir, pathname.slice(1));
    if (!target) send(res, 404, 'Not found');
    else
      sendFile(res, target, {
        'Content-Security-Policy': viewerCsp(ctx.boardOrigins()),
      });
  },
};
