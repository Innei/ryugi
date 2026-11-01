import type http from 'node:http';
import type { Duplex } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { accessPolicy } from '../src/server/access';
import {
  dispatchHttp,
  dispatchUpgrade,
  type HttpRoute,
  type RouteContext,
  type UpgradeRoute,
} from '../src/server/routes/table';

const fakeContext = (overrides: Partial<RouteContext> = {}): RouteContext => ({
  agentOk: (req) => req.headers.origin === undefined,
  isAuthorized: (_req, key) => key === 'secret',
  keyOk: (key) => key === 'secret',
  loopback: true,
  options: {},
  policy: accessPolicy({ host: '127.0.0.1', urlHost: '127.0.0.1', ports: [4000] }),
  sameOrigin: (req) => req.headers.origin === `http://${req.headers.host}`,
  touch: vi.fn(),
  ...overrides,
});

const fakeRequest = (url: string, headers: http.IncomingHttpHeaders = {}, method = 'GET') =>
  ({ url, method, headers: { host: '127.0.0.1:4000', ...headers } }) as http.IncomingMessage;

const fakeResponse = () => {
  const res = {
    status: 0,
    body: '',
    headersSent: false,
    setHeader: () => {},
    writeHead(status: number) {
      res.status = status;
      res.headersSent = true;
    },
    end(body: string) {
      res.body = String(body);
    },
  };
  return res;
};

const run = (routes: HttpRoute<RouteContext>[], req: http.IncomingMessage, ctx = fakeContext()) => {
  const res = fakeResponse();
  dispatchHttp(routes, req, res as unknown as http.ServerResponse, ctx);
  return res;
};

const reply =
  (text: string): HttpRoute<RouteContext>['handle'] =>
  (_req, res) => {
    res.writeHead(200);
    res.end(text);
  };

describe('route table dispatch', () => {
  it('serves the first route that matches, in table order', () => {
    const routes: HttpRoute<RouteContext>[] = [
      { path: /^\/api\/thing\/([^/]+)$/, auth: 'viewer', handle: reply('first') },
      { path: '/api/thing/one', auth: 'viewer', handle: reply('second') },
    ];
    expect(run(routes, fakeRequest('/api/thing/one?key=secret')).body).toBe('first');
  });

  it('matches raw routes on the undecoded path without recording activity', () => {
    const ctx = fakeContext();
    const routes: HttpRoute<RouteContext>[] = [
      { path: '/status', raw: true, auth: 'key', handle: reply('status') },
      { path: '/status', auth: 'public', handle: reply('decoded') },
    ];
    expect(run(routes, fakeRequest('/status?key=secret'), ctx).body).toBe('status');
    expect(ctx.touch).not.toHaveBeenCalled();
    expect(run(routes, fakeRequest('/st%61tus'), ctx).body).toBe('decoded');
    expect(ctx.touch).toHaveBeenCalledTimes(1);
  });

  it('checks the origin before the key, then the method and the rule', () => {
    const routes: HttpRoute<RouteContext>[] = [
      { path: '/agent', methods: ['POST'], auth: 'agent', handle: reply('agent') },
    ];
    expect(run(routes, fakeRequest('/agent', { origin: 'http://evil.test' })).body).toBe(
      'Forbidden origin',
    );
    expect(run(routes, fakeRequest('/agent', {}, 'POST')).body).toBe(
      'Forbidden: open the full artifact link including ?key=',
    );
    expect(run(routes, fakeRequest('/agent?key=secret')).body).toBe(
      'Forbidden: agent calls need ?key=',
    );
    expect(run(routes, fakeRequest('/agent?key=secret', {}, 'POST')).body).toBe('agent');
  });

  it('answers 400 for a path that cannot be decoded and 500 when a handler rejects', async () => {
    expect(run([], fakeRequest('/%E0')).status).toBe(400);
    const res = run(
      [{ path: '/boom', auth: 'public', handle: () => Promise.reject(new Error('boom')) }],
      fakeRequest('/boom'),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect([res.status, res.body]).toEqual([500, 'Artifacts error: boom']);
  });

  it('rejects upgrades without a websocket key, failing auth, or matching no route', () => {
    const accepted: string[] = [];
    const routes: UpgradeRoute<RouteContext>[] = [
      {
        path: '/ws',
        auth: 'socket',
        handle: (_req, _socket, _ctx, { key }) => accepted.push(key!),
      },
    ];
    const upgrade = (url: string, headers: http.IncomingHttpHeaders) => {
      const socket = { end: vi.fn() };
      dispatchUpgrade(
        routes,
        fakeRequest(url, headers),
        socket as unknown as Duplex,
        fakeContext(),
      );
      return socket.end.mock.calls[0]?.[0] as string | undefined;
    };
    const sameOrigin = { origin: 'http://127.0.0.1:4000' };
    expect(upgrade('/ws?key=secret', sameOrigin)).toMatch(/^HTTP\/1.1 400/);
    expect(upgrade('/ws?key=wrong', { ...sameOrigin, 'sec-websocket-key': 'k' })).toMatch(
      /^HTTP\/1.1 403/,
    );
    expect(upgrade('/other?key=secret', { ...sameOrigin, 'sec-websocket-key': 'k' })).toMatch(
      /^HTTP\/1.1 400/,
    );
    expect(upgrade('/ws?key=secret', { ...sameOrigin, 'sec-websocket-key': 'k' })).toBeUndefined();
    expect(accepted).toEqual(['secret']);
  });
});
