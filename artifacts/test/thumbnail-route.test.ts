import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { type ArtifactsServer, startArtifactsServer } from '../src/server/app';
import { renderThumbnail } from '../src/shared/thumbnail';
import { get, tempRoot, writeArtboard, writeDocument, writeHtml } from './helpers';

const canvas = {
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: {
    a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400, title: 'Sidebar' },
  },
};

let running: ArtifactsServer[] = [];
afterEach(async () => {
  await Promise.all(running.map((s) => s.close()));
  running = [];
});

async function start() {
  const { root, viewer, runtime } = tempRoot();
  const server = await startArtifactsServer({
    root,
    viewerDir: viewer,
    runtimeDir: runtime,
    host: '127.0.0.1',
    urlHost: 'localhost',
  });
  running.push(server);
  return { server, root };
}

const base = (s: ArtifactsServer) => `http://127.0.0.1:${s.port}`;
const cookie = (s: ArtifactsServer) => `ryugi_artifacts_${s.port}=${s.token}`;
const thumbnail = (s: ArtifactsServer, address: string) =>
  get(`${base(s)}/api/thumbnail${address}.svg?v=1`, { Cookie: cookie(s) });

test('each artifact type is drawn from the payload publish would send', async () => {
  const { server, root } = await start();
  writeDocument(root, 'spec', {
    'doc.xml': '<doc><h1>Actual design</h1><p>Opening paragraph</p></doc>',
  });
  writeArtboard(root, 'ideas', canvas, { 'pages/p/a.html': '<p>Actual board</p>' });
  writeHtml(root, 'tuner', { 'index.html': '<title>Actual tuner</title>' });
  const list = JSON.parse(
    (await get(`${base(server)}/api/artifacts`, { Cookie: cookie(server) })).body,
  ) as {
    artifacts: {
      type: 'artboard' | 'document' | 'html';
      id: string;
      url?: string;
      title: string;
    }[];
  };
  expect(list.artifacts).toHaveLength(3);
  for (const artifact of list.artifacts) {
    const response = await thumbnail(server, artifact.url ?? `/${artifact.type}/${artifact.id}`);
    expect(response.status, artifact.id).toBe(200);
    expect(response.headers['content-type']).toBe('image/svg+xml');
    expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(response.headers['content-security-policy']).toBe(
      "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    const preview = JSON.parse(
      (
        await get(`${base(server)}/api/preview/${artifact.type}/${artifact.id}`, {
          Cookie: cookie(server),
        })
      ).body,
    );
    const project = path.basename(path.dirname(path.dirname(root)));
    expect(response.body).toBe(
      renderThumbnail(
        { id: artifact.id, type: artifact.type, title: preview.title, project },
        preview,
      ),
    );
  }
  expect((await thumbnail(server, '/artboard/ideas')).body).toContain('Sidebar');
  expect((await thumbnail(server, '/document/spec')).body).toContain('Opening paragraph');
});

test('thumbnails refuse foreign pages and need a real artifact', async () => {
  const { server, root } = await start();
  writeHtml(root, 'tuner', { 'index.html': '<title>Actual tuner</title>' });
  expect(
    (await get(`${base(server)}/api/thumbnail/html/tuner.svg`, { Origin: 'https://evil.test' }))
      .status,
  ).toBe(403);
  expect((await thumbnail(server, '/html/missing')).status).toBe(404);
  expect((await thumbnail(server, '/html/..%2F..%2Fetc')).status).toBe(404);
  expect((await thumbnail(server, '/nope/tuner')).status).toBe(404);
});
