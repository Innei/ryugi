import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { type ArtifactsServer, startArtifactsServer } from '../src/server/app';
import { artifactPath } from '../src/server/artifact-address';
import { updateArtifactConfig } from '../src/server/config';
import { canonicalPath, parseRoute } from '../src/viewer/lib/route';
import { get, tempRoot, writeArtboard } from './helpers';

const CLOUD = 'https://ryugi.example';
let running: ArtifactsServer[] = [];
afterEach(async () => {
  await Promise.all(running.map((server) => server.close()));
  running = [];
});

async function start(cloud = true) {
  const { root, viewer, runtime } = tempRoot();
  fs.writeFileSync(
    path.join(viewer, 'index.html'),
    '<!doctype html><html><head><title>viewer</title></head><body></body></html>',
  );
  writeArtboard(root, 'ideas', { version: 1, boards: {}, pages: [{ id: 'p', name: 'P' }] }, {});
  const configFile = path.join(root, 'config.json');
  updateArtifactConfig(configFile, 'artboard/ideas', {
    cloud: {
      id: 'cloudIdeas',
      url: `${CLOUD}/a/cloudIdeas`,
      publishedAt: null,
      visibility: 'private',
    },
  });
  const server = await startArtifactsServer({
    root,
    configFile,
    viewerDir: viewer,
    runtimeDir: runtime,
    host: '127.0.0.1',
    urlHost: 'localhost',
    ...(cloud
      ? { cloud: { origin: CLOUD, credentialsFile: path.join(root, 'creds.json') } as never }
      : {}),
  });
  running.push(server);
  return { server, address: artifactPath(root, 'artboard', 'ideas').split('/').pop()! };
}

test('the embed route serves the canvas framable only by the cloud origin', async () => {
  const { server, address } = await start();
  const page = await get(`http://127.0.0.1:${server.port}/embed/artboard/${address}`, {
    'Sec-Fetch-Site': 'cross-site',
  });
  expect(page.status).toBe(200);
  expect(String(page.headers['content-security-policy'])).toContain(`frame-ancestors ${CLOUD}`);
  expect(page.body).toContain(`data-ryugi-embed-parent="${CLOUD}"`);
});

test('the embed route also opens an artboard by the id it was published under', async () => {
  const { server } = await start();
  const page = await get(`http://127.0.0.1:${server.port}/embed/artboard/cloudIdeas`);
  expect(page.status).toBe(200);
  expect(page.body).toContain('data-ryugi-artifact-id="ideas"');
});

test('ordinary pages still refuse every frame', async () => {
  const { server, address } = await start();
  const page = await get(`http://127.0.0.1:${server.port}/artboard/${address}`);
  expect(String(page.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
  expect(page.body).not.toContain('data-ryugi-embed-parent');
});

test('without a cloud origin there is no embed route', async () => {
  const { server, address } = await start(false);
  expect((await get(`http://127.0.0.1:${server.port}/embed/artboard/${address}`)).status).toBe(404);
});

test('only artboards embed', async () => {
  const { server } = await start();
  expect((await get(`http://127.0.0.1:${server.port}/embed/html/ideas`)).status).toBe(404);
});

test('an embed page moves to its canonical address and stays an embed', () => {
  const address = '/artboard/AbCdEfGhIjKlMnOpQrStU';
  expect(canonicalPath('/embed/artboard/ideas', address)).toBe(`/embed${address}`);
  expect(canonicalPath('/artboard/ideas', address)).toBe(address);
});

test('the viewer routes an embed path to the artboard', () => {
  expect(parseRoute('/embed/artboard/AbCdEfGhIjKlMnOpQrStU')).toEqual({
    kind: 'embed',
    type: 'artboard',
    id: 'AbCdEfGhIjKlMnOpQrStU',
  });
  expect(parseRoute('/embed/html/AbCdEfGhIjKlMnOpQrStU')).toEqual({ kind: 'unknown' });
  expect(parseRoute('/embed/artboard/AbCdEfGhIjKlMnOpQr_-')).toEqual({
    kind: 'embed',
    type: 'artboard',
    id: 'AbCdEfGhIjKlMnOpQr_-',
  });
});
