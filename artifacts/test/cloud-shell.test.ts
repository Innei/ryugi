import { describe, expect, test } from 'vitest';
import { changeVisibility, loadShell, loginUrl, switchAccount } from '../src/viewer/lib/cloud-shell';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  credentials: RequestCredentials | undefined;
}

function fakeFetch(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    calls.push({ url, method, headers: Object.fromEntries(new Headers(init.headers).entries()), body: init.body as string | undefined, credentials: init.credentials });
    const route = routes[`${method} ${url}`];
    if (!route) throw new Error(`unexpected ${method} ${url}`);
    return route();
  }) as typeof fetch;
  return { impl, calls };
}

describe('loading the shell', () => {
  test('a readable artifact gives its title, ownership and visibility', async () => {
    const { impl } = fakeFetch({ 'GET /api/a/abc/meta': () => Response.json({ type: 'html', title: 'Arrow', owner: true, visibility: 'private' }) });
    expect(await loadShell('abc', impl)).toEqual({ kind: 'ready', type: 'html', title: 'Arrow', owner: true, visibility: 'private' });
  });

  test('an artifact that is not published yet is named as such for its owner', async () => {
    const { impl } = fakeFetch({ 'GET /api/a/abc/meta': () => Response.json({ title: null, owner: true, visibility: 'private', published: false }) });
    expect(await loadShell('abc', impl)).toEqual({ kind: 'ready', type: null, title: 'Not published yet', owner: true, visibility: 'private' });
  });

  test('a link that will not open asks who is signed in', async () => {
    const { impl, calls } = fakeFetch({
      'GET /api/a/abc/meta': () => Response.json({ error: 'artifact not found' }, { status: 404 }),
      'GET /api/session': () => Response.json({ login: 'Innei' }),
    });
    expect(await loadShell('abc', impl)).toEqual({ kind: 'missing', login: 'Innei' });
    expect(calls.every((c) => c.credentials === 'same-origin')).toBe(true);
  });

  test('a signed-out visitor of a link that will not open has no login', async () => {
    const { impl } = fakeFetch({
      'GET /api/a/abc/meta': () => Response.json({ error: 'artifact not found' }, { status: 404 }),
      'GET /api/session': () => Response.json({ login: null }),
    });
    expect(await loadShell('abc', impl)).toEqual({ kind: 'missing', login: null });
  });

  test('a server error is reported, not shown as missing', async () => {
    const { impl } = fakeFetch({ 'GET /api/a/abc/meta': () => new Response('boom', { status: 500 }) });
    expect(await loadShell('abc', impl)).toEqual({ kind: 'failed', message: "Couldn't load (500)" });
  });
});

describe('changing visibility', () => {
  test('sends a same-origin JSON patch and returns what the cloud stored', async () => {
    const { impl, calls } = fakeFetch({ 'PATCH /api/a/abc': () => Response.json({ id: 'abc', visibility: 'public' }) });
    expect(await changeVisibility('abc', 'public', impl)).toBe('public');
    expect(calls[0]).toMatchObject({ headers: { 'content-type': 'application/json' }, body: '{"visibility":"public"}', credentials: 'same-origin' });
  });

  test('a refusal is thrown with the cloud’s message', async () => {
    const { impl } = fakeFetch({ 'PATCH /api/a/abc': () => Response.json({ error: 'sign in to Ryugi Cloud first' }, { status: 401 }) });
    await expect(changeVisibility('abc', 'public', impl)).rejects.toThrow('sign in to Ryugi Cloud first');
  });
});

describe('switching accounts', () => {
  test('signs out first, then sends the browser to the account picker for this link', async () => {
    const { impl, calls } = fakeFetch({ 'POST /auth/logout': () => new Response(null, { status: 204 }) });
    expect(await switchAccount('abc', impl)).toBe('/auth/login?return=%2Fa%2Fabc&switch=1');
    expect(calls[0]).toMatchObject({ headers: { 'content-type': 'application/json' }, credentials: 'same-origin' });
  });

  test('the plain sign-in link returns to the artifact', () => {
    expect(loginUrl('abc')).toBe('/auth/login?return=%2Fa%2Fabc');
  });
});
