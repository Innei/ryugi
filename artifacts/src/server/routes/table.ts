import type http from 'node:http';
import type { Duplex } from 'node:stream';

import { type AccessPolicy, hostAllowed, navigationAllowed, originAllowed } from '../access';
import { send } from '../http';
import { rejectUpgrade } from '../ws';

export interface RouteContext {
  agentOk: (req: http.IncomingMessage, key: string | null) => boolean;
  isAuthorized: (req: http.IncomingMessage, key: string | null) => boolean;
  keyOk: (key: string | null) => boolean;
  loopback: boolean;
  options: { cloud?: { origin: string } };
  policy: AccessPolicy;
  sameOrigin: (req: http.IncomingMessage) => boolean;
  touch: () => void;
}

export interface RouteParams {
  key: string | null;
  match: string[];
  pathname: string;
  url: URL;
}

type Matcher<C> = string | RegExp | ((pathname: string, ctx: C) => string[] | null);

export type HttpAuth =
  'public' | 'key' | 'viewer' | 'navigation' | 'agent' | 'same-origin' | 'cloud';

export interface HttpRoute<C extends RouteContext> {
  auth: HttpAuth;
  handle: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    ctx: C,
    params: RouteParams,
  ) => void | Promise<unknown>;
  methods?: string[];
  path: Matcher<C>;
  raw?: boolean;
}

export type UpgradeAuth = 'direct-relay' | 'socket';

export interface UpgradeRoute<C extends RouteContext> {
  auth: UpgradeAuth;
  handle: (
    req: http.IncomingMessage,
    socket: Duplex,
    ctx: C,
    params: RouteParams & { clientKey: string },
  ) => void;
  path: Matcher<C>;
}

const AGENT_DENIED = 'Forbidden: agent calls need ?key=';

interface HttpRule {
  allow: (req: http.IncomingMessage, ctx: RouteContext, key: string | null) => boolean;
  denied: string;
  gated: boolean;
}

const HTTP_RULES: Record<HttpAuth, HttpRule> = {
  'public': { gated: false, denied: 'Forbidden', allow: () => true },
  'key': {
    gated: false,
    denied: AGENT_DENIED,
    allow: (req, ctx, key) => ctx.isAuthorized(req, key),
  },
  'viewer': { gated: true, denied: 'Forbidden', allow: () => true },
  'navigation': {
    gated: true,
    denied: 'Forbidden',
    allow: (req, ctx) =>
      !ctx.loopback || navigationAllowed(req.headers['sec-fetch-site'] as string | undefined),
  },
  'agent': { gated: true, denied: AGENT_DENIED, allow: (req, ctx, key) => ctx.agentOk(req, key) },
  'same-origin': { gated: true, denied: 'Forbidden', allow: (req, ctx) => ctx.sameOrigin(req) },
  'cloud': {
    gated: true,
    denied: 'Forbidden',
    allow: (req, ctx, key) => req.method === 'GET' || ctx.keyOk(key) || ctx.sameOrigin(req),
  },
};

const UPGRADE_RULES: Record<
  UpgradeAuth,
  (req: http.IncomingMessage, ctx: RouteContext, key: string | null) => boolean
> = {
  'direct-relay': (req, ctx, key) => {
    const fromCloud =
      ctx.options.cloud !== undefined && req.headers.origin === ctx.options.cloud.origin;
    return ctx.keyOk(key) && (fromCloud || ctx.sameOrigin(req));
  },
  'socket': (req, ctx, key) => ctx.isAuthorized(req, key) && ctx.sameOrigin(req),
};

function matchPath<C>(matcher: Matcher<C>, pathname: string, ctx: C): string[] | null {
  if (typeof matcher === 'string') return matcher === pathname ? [pathname] : null;
  if (matcher instanceof RegExp) return matcher.exec(pathname);
  return matcher(pathname, ctx);
}

function httpDenial(
  { auth, methods }: { auth: HttpAuth; methods?: string[] },
  req: http.IncomingMessage,
  ctx: RouteContext,
  key: string | null,
) {
  const rule = HTTP_RULES[auth];
  if (rule.gated) {
    if (ctx.loopback && !originAllowed(ctx.policy, req.headers.origin)) return 'Forbidden origin';
    if (!ctx.isAuthorized(req, key))
      return 'Forbidden: open the full artifact link including ?key=';
  }
  if (methods && !methods.includes(req.method ?? '')) return rule.denied;
  return rule.allow(req, ctx, key) ? null : rule.denied;
}

export function dispatchHttp<C extends RouteContext>(
  routes: HttpRoute<C>[],
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: C,
) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!hostAllowed(ctx.policy, req.headers.host)) {
    send(res, 403, 'Forbidden host');
    return;
  }
  const url = new URL(req.url ?? '/', 'http://artifacts.local');
  const key = url.searchParams.get('key');
  const serve = (candidates: HttpRoute<C>[], pathname: string) => {
    for (const route of candidates) {
      const match = matchPath(route.path, pathname, ctx);
      if (!match) continue;
      const denied = httpDenial(route, req, ctx, key);
      if (denied !== null) {
        send(res, 403, denied);
        return true;
      }
      const pending = route.handle(req, res, ctx, { key, match, pathname, url });
      if (pending instanceof Promise)
        pending.catch((err) => {
          if (!res.headersSent) send(res, 500, `Artifacts error: ${(err as Error).message}`);
        });
      return true;
    }
    return false;
  };
  const raw = routes.filter((route) => route.raw);
  if (serve(raw, url.pathname)) return;
  ctx.touch();
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    send(res, 400, 'Bad request');
    return;
  }
  const decoded = routes.filter((route) => !route.raw);
  if (!serve(decoded, pathname)) send(res, 404, 'Not found');
}

export function dispatchUpgrade<C extends RouteContext>(
  routes: UpgradeRoute<C>[],
  req: http.IncomingMessage,
  socket: Duplex,
  ctx: C,
) {
  if (!hostAllowed(ctx.policy, req.headers.host)) {
    rejectUpgrade(socket, 403, 'Forbidden');
    return;
  }
  const url = new URL(req.url ?? '/', 'http://artifacts.local');
  const clientKey = req.headers['sec-websocket-key'];
  const key = url.searchParams.get('key');
  if (typeof clientKey !== 'string') {
    rejectUpgrade(socket, 400, 'Bad Request');
    return;
  }
  for (const route of routes) {
    const match = matchPath(route.path, url.pathname, ctx);
    if (!match) continue;
    if (!UPGRADE_RULES[route.auth](req, ctx, key)) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    route.handle(req, socket, ctx, { key, match, pathname: url.pathname, url, clientKey });
    return;
  }
  rejectUpgrade(socket, 400, 'Bad Request');
}
