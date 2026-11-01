import { parseAcceptLanguage, resolveLocale } from '../../shared/locale';
import type { ServerContext } from '../context';
import { sendJson } from '../http';
import type { HttpRoute } from './table';

export const cloudCallbackRoute: HttpRoute<ServerContext> = {
  path: (pathname, ctx) => (ctx.cloud && pathname === '/api/cloud/callback' ? [pathname] : null),
  auth: 'public',
  handle: (req, res, ctx, { url }) =>
    ctx.cloud!.handleCallback(
      url,
      res,
      resolveLocale(parseAcceptLanguage(req.headers['accept-language'])),
    ),
};

export const cloudAutoPublishCallbackRoute: HttpRoute<ServerContext> = {
  path: (pathname, ctx) =>
    ctx.cloud && pathname === '/api/cloud/callback/auto-publish' ? [pathname] : null,
  auth: 'public',
  handle: (req, res, ctx) =>
    ctx.cloud!.handleCallbackAutoPublish(
      req,
      res,
      resolveLocale(parseAcceptLanguage(req.headers['accept-language'])),
    ),
};

export const cloudFlushRoute: HttpRoute<ServerContext> = {
  path: '/api/cloud/flush',
  methods: ['POST'],
  auth: 'agent',
  handle: (_req, res, { autoPublisher }, { url }) => {
    if (!autoPublisher) sendJson(res, 404, { error: 'cloud publishing is not configured' });
    else if (url.searchParams.get('wait') === '1')
      void autoPublisher.flush().then(() => sendJson(res, 200, { flushed: true }));
    else {
      void autoPublisher.flush();
      sendJson(res, 202, { queued: true });
    }
  },
};

export const cloudApiRoute: HttpRoute<ServerContext> = {
  path: (pathname, ctx) => ctx.cloud?.match(pathname) ?? null,
  auth: 'cloud',
  handle: (req, res, ctx, { match }) => {
    void ctx.cloud!.handle(req, res, match as RegExpExecArray);
  },
};
