import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { type ArtifactsServer, startArtifactsServer } from '../src/server/app';
import { artifactPath } from '../src/server/artifact-address';
import { get, openWs, tempRoot, writeArtboard } from './helpers';

let running: ArtifactsServer[] = [];
afterEach(async () => {
  await Promise.all(running.map((server) => server.close()));
  running = [];
});

const CANVAS = {
  version: 1,
  boards: { a: { file: 'pages/a.html', page: 'p', x: 0, y: 0, w: 400, h: 300 } },
  pages: [{ id: 'p', name: 'P' }],
};

async function start(host = '127.0.0.1') {
  const { root, viewer, runtime } = tempRoot();
  fs.writeFileSync(path.join(viewer, 'index.html'), '<!doctype html><title>viewer</title>');
  writeArtboard(root, 'ideas', CANVAS, { 'pages/a.html': '<!doctype html><body>A</body>' });
  const server = await startArtifactsServer({
    root,
    viewerDir: viewer,
    runtimeDir: runtime,
    host,
    urlHost: 'localhost',
  });
  running.push(server);
  return { server, root };
}

const at = (server: ArtifactsServer, rest: string, headers: Record<string, string> = {}) =>
  get(`http://127.0.0.1:${server.port}${rest}`, headers);

function post(server: ArtifactsServer, rest: string, headers: Record<string, string>, body = '{}') {
  return new Promise<number>((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${server.port}${rest}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('a loopback server needs no key', async () => {
  const { server } = await start();
  expect(server.url).not.toContain('key=');
  expect((await at(server, '/api/artifacts')).status).toBe(200);
  expect((await at(server, '/api/artifacts/artboard/ideas')).status).toBe(200);
  expect((await at(server, '/api/status')).status).toBe(200);
});

test('links to artifacts carry no key', async () => {
  const { server } = await start();
  expect(server.linkFor('artboard', 'ideas')).not.toContain('key=');
});

test('a foreign Host is refused, which stops DNS rebinding', async () => {
  const { server } = await start();
  const host = `evil.test:${server.port}`;
  expect((await at(server, '/api/artifacts', { Host: host })).status).toBe(403);
  expect((await at(server, '/', { Host: host })).status).toBe(403);
  expect(
    (
      await get(`http://127.0.0.1:${server.boardPort}/robots.txt`, {
        Host: `evil.test:${server.boardPort}`,
      })
    ).status,
  ).toBe(403);
});

test('a foreign Origin cannot write', async () => {
  const { server } = await start();
  expect(await post(server, '/api/artboard/ideas/comments', { Origin: 'https://evil.test' })).toBe(
    403,
  );
});

test('a local process without an Origin can call agent routes', async () => {
  const { server } = await start();
  expect(await post(server, '/api/agent/artboard/ideas/check', {})).not.toBe(403);
});

test('the library is only served to direct or same-origin loads', async () => {
  const { server } = await start();
  expect((await at(server, '/', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  expect((await at(server, '/', { 'Sec-Fetch-Site': 'same-site' })).status).toBe(403);
  expect((await at(server, '/', { 'Sec-Fetch-Site': 'none' })).status).toBe(200);
});

test('board content is not readable through CORS', async () => {
  const { server, root } = await start();
  const address = artifactPath(root, 'artboard', 'ideas').split('/').pop()!;
  const page = await get(
    `http://127.0.0.1:${server.boardPort}/c/artboard/${address}/pages/a.html`,
    { Origin: 'https://evil.test' },
  );
  expect(page.headers['access-control-allow-origin']).toBeUndefined();
});

test('the socket refuses a foreign Host', async () => {
  const { server } = await start();
  const result = await openWs(server.port, {
    Host: `evil.test:${server.port}`,
    Origin: `http://evil.test:${server.port}`,
  });
  expect(result.status).toBe(403);
});

test('a server bound beyond loopback opens no board port, so boards stay behind the key', async () => {
  const { server } = await start('0.0.0.0');
  expect(server.boardPort).toBe(0);
  const api = await at(server, `/api/artifacts/artboard/ideas?key=${server.token}`);
  expect(JSON.parse(api.body)).not.toHaveProperty('boardPort');
});

test('a copied artboard that shares its id answers 500 on the board port and the server stays up', async () => {
  const { server, root } = await start();
  const address = artifactPath(root, 'artboard', 'ideas').split('/').pop()!;
  fs.cpSync(path.join(root, 'artboard', 'ideas'), path.join(root, 'artboard', 'ideas-copy'), {
    recursive: true,
  });
  const board = await get(
    `http://127.0.0.1:${server.boardPort}/c/artboard/${address}/pages/a.html`,
  );
  expect(board.status).toBe(500);
  expect((await get(`http://127.0.0.1:${server.boardPort}/robots.txt`)).status).toBe(200);
});

test('a url host with capitals still lets its own links in', async () => {
  const { root, viewer, runtime } = tempRoot();
  fs.writeFileSync(path.join(viewer, 'index.html'), '<!doctype html><title>viewer</title>');
  const server = await startArtifactsServer({
    root,
    viewerDir: viewer,
    runtimeDir: runtime,
    host: '127.0.0.1',
    urlHost: 'MyMac.local',
  });
  running.push(server);
  expect((await at(server, '/api/artifacts', { Host: `MyMac.local:${server.port}` })).status).toBe(
    200,
  );
});

test('a server bound beyond loopback still requires the key', async () => {
  const { server } = await start('0.0.0.0');
  expect((await at(server, '/api/artifacts')).status).toBe(403);
  expect((await at(server, `/api/artifacts?key=${server.token}`)).status).toBe(200);
  expect(server.url).toContain(`key=${server.token}`);
});
