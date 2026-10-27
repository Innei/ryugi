import { afterEach, expect, test, vi } from 'vitest';

import { call, closeAll, start } from './fake-cloud';
import { openWs, writeHtml } from './helpers';

afterEach(closeAll);

test('unpublishing tells open pages that the cloud version is no longer available', async () => {
  const { server, root } = await start();
  const ws = await openWs(server.port, {
    Cookie: `ryugi_artifacts_${server.port}=${server.token}`,
    Origin: `http://127.0.0.1:${server.port}`,
    Host: `127.0.0.1:${server.port}`,
  });
  try {
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await vi.waitFor(() =>
      expect(ws.messages.some((text) => JSON.parse(text).type === 'change')).toBe(true),
    );
    await call(server, 'POST', '/api/cloud/publish/html/a');
    await vi.waitFor(() =>
      expect(ws.messages.some((text) => JSON.parse(text).publication?.phase === 'published')).toBe(
        true,
      ),
    );
    const before = ws.messages.length;
    await call(server, 'DELETE', '/api/cloud/publish/html/a');
    await vi.waitFor(() =>
      expect(
        ws.messages.slice(before).some((text) => {
          const event = JSON.parse(text);
          return event.publication?.phase === 'waiting' && event.publication.publishedAt === null;
        }),
      ).toBe(true),
    );
  } finally {
    ws.socket?.destroy();
  }
});

test('reserving a link does not claim a cloud version exists', async () => {
  const { server, root } = await start();
  writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
  const status = await call(server, 'GET', '/api/cloud/publication/html/a');
  expect(status.status).toBe(200);
  expect(status.json).toMatchObject({ phase: 'waiting', publishedAt: null });
});

test('uploading and committing keep the first link unavailable until the version succeeds', async () => {
  const { server, root, cloud } = await start();
  writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
  let upload!: () => void;
  let commit!: () => void;
  const uploaded = new Promise<void>((resolve) => {
    upload = resolve;
  });
  const committed = new Promise<void>((resolve) => {
    commit = resolve;
  });
  let commits = 0;
  cloud.gate = (r) =>
    r.method === 'PUT'
      ? uploaded
      : r.path.endsWith('/versions') && ++commits === 2
        ? committed
        : undefined;
  const pending = call(server, 'POST', '/api/cloud/publish/html/a');
  try {
    await vi.waitFor(() => expect(cloud.requests.some((r) => r.method === 'PUT')).toBe(true));
    expect((await call(server, 'GET', '/api/cloud/publication/html/a')).json).toMatchObject({
      phase: 'uploading',
      publishedAt: null,
    });
    upload();
    await vi.waitFor(() => expect(commits).toBe(2));
    expect((await call(server, 'GET', '/api/cloud/publication/html/a')).json).toMatchObject({
      phase: 'publishing',
      publishedAt: null,
    });
    commit();
    expect((await pending).status).toBe(200);
    expect((await call(server, 'GET', '/api/cloud/publication/html/a')).json).toMatchObject({
      phase: 'published',
      publishedAt: '2026-10-20T08:00:00.000Z',
    });
  } finally {
    upload();
    commit();
    await pending;
  }
});

test('a failed update retains the last cloud version and can be retried', async () => {
  const { server, root, cloud } = await start();
  writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
  await call(server, 'POST', '/api/cloud/publish/html/a');
  writeHtml(root, 'a', { 'index.html': '<title>B</title>' });
  cloud.respond = (r) =>
    r.method === 'PUT' ? { status: 503, body: { error: 'temporarily unavailable' } } : undefined;
  expect((await call(server, 'POST', '/api/cloud/publish/html/a')).status).toBe(503);
  expect((await call(server, 'GET', '/api/cloud/publication/html/a')).json).toMatchObject({
    phase: 'failed',
    publishedAt: '2026-10-20T08:00:00.000Z',
  });
  cloud.respond = () => undefined;
  expect((await call(server, 'POST', '/api/cloud/publish/html/a')).status).toBe(200);
  expect((await call(server, 'GET', '/api/cloud/publication/html/a')).json).toMatchObject({
    phase: 'published',
    publishedAt: '2026-10-20T09:00:00.000Z',
  });
});

test('an incomplete artifact reports its blocking reason without creating a cloud version', async () => {
  const { server, root, cloud } = await start();
  writeHtml(root, 'a', { 'other.html': '<title>A</title>' });
  expect((await call(server, 'POST', '/api/cloud/publish/html/a')).status).toBe(409);
  const { json } = await call(server, 'GET', '/api/cloud/publication/html/a');
  expect(json).toMatchObject({ phase: 'not-ready', publishedAt: null });
  expect((json.reasons as string[]).length).toBeGreaterThan(0);
  expect(cloud.store.size).toBe(0);
});
