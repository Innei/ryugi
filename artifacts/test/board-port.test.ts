import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { type ArtifactsServer, startArtifactsServer } from '../src/server/app';
import { artifactPath } from '../src/server/artifact-address';
import { get, readJson, tempRoot, writeArtboard } from './helpers';

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

async function start(cloud?: string) {
  const { root, viewer, runtime } = tempRoot();
  fs.writeFileSync(path.join(viewer, 'index.html'), '<!doctype html><title>viewer</title>');
  fs.writeFileSync(path.join(runtime, 'ryugi-ui.js'), 'void 0');
  writeArtboard(root, 'ideas', CANVAS, {
    'pages/a.html': '<!doctype html><html><head></head><body>A</body></html>',
    'pages/style.css': 'body{}',
  });
  const server = await startArtifactsServer({
    root,
    viewerDir: viewer,
    runtimeDir: runtime,
    host: '127.0.0.1',
    urlHost: 'localhost',
    ...(cloud
      ? { cloud: { origin: cloud, credentialsFile: path.join(root, 'creds.json') } as never }
      : {}),
  });
  running.push(server);
  const address = artifactPath(root, 'artboard', 'ideas').split('/').pop()!;
  return { server, root, address };
}

const board = (server: ArtifactsServer, rest: string) =>
  get(`http://127.0.0.1:${server.boardPort}${rest}`);

test('listens on a second port, recorded in server-info', async () => {
  const { server, root } = await start();
  expect(server.boardPort).toBeGreaterThan(0);
  expect(server.boardPort).not.toBe(server.port);
  expect(readJson(path.join(root, '.state', 'server-info')).boardPort).toBe(server.boardPort);
});

test('serves a board page by address with a same-origin friendly CSP', async () => {
  const { server, address } = await start('https://ryugi.example');
  const page = await board(server, `/c/artboard/${address}/pages/a.html`);
  expect(page.status).toBe(200);
  expect(page.body).toContain('A');
  const csp = String(page.headers['content-security-policy']);
  expect(csp).not.toContain('sandbox');
  expect(csp).toContain("worker-src 'none'");
  expect(csp).toContain(`frame-ancestors http://localhost:${server.port}`);
  expect(csp).toContain(`http://127.0.0.1:${server.port}`);
  expect(csp).toContain('https://ryugi.example');
});

test('serves board assets and the runtime', async () => {
  const { server, address } = await start();
  expect((await board(server, `/c/artboard/${address}/pages/style.css`)).status).toBe(200);
  expect((await board(server, '/c/runtime/ryugi-ui.js')).status).toBe(200);
  expect((await board(server, '/robots.txt')).status).toBe(200);
});

test('refuses directory slugs, other artifact types and the API', async () => {
  const { server } = await start();
  expect((await board(server, '/c/artboard/ideas/pages/a.html')).status).toBe(404);
  expect((await board(server, '/c/html/ideas/index.html')).status).toBe(404);
  expect((await board(server, '/api/artifacts')).status).toBe(404);
  expect((await board(server, '/')).status).toBe(404);
});

test('the artifact API tells the viewer where boards live', async () => {
  const { server, address } = await start();
  const payload = JSON.parse(
    (
      await get(`http://127.0.0.1:${server.port}/api/artifacts/artboard/ideas`, {
        Cookie: `ryugi_artifacts_${server.port}=${server.token}`,
      })
    ).body,
  );
  expect(payload.boardPort).toBe(server.boardPort);
  expect(payload.boardPath).toBe(`/c/artboard/${address}/`);
});

test('the viewer may frame the board port', async () => {
  const { server } = await start();
  const shell = await get(`http://127.0.0.1:${server.port}/?key=${server.token}`);
  expect(String(shell.headers['content-security-policy'])).toContain(
    `http://localhost:${server.boardPort}`,
  );
});
