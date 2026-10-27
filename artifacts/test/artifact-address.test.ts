import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { startArtifactsServer, type ArtifactsServer } from '../src/server/app';
import { get, tempRoot, writeArtboard, writeDocument, writeHtml } from './helpers';

let server: ArtifactsServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function start(root = tempRoot().root) {
  const { viewer } = tempRoot();
  fs.writeFileSync(
    path.join(viewer, 'index.html'),
    '<!doctype html><html><head><title>viewer</title></head></html>',
  );
  server = await startArtifactsServer({
    root,
    viewerDir: viewer,
    host: '127.0.0.1',
    urlHost: 'localhost',
  });
  const request = (pathname: string) =>
    get(`http://127.0.0.1:${server!.port}${pathname}`, {
      Cookie: `ryugi_artifacts_${server!.port}=${server!.token}`,
    });
  return { root, request };
}

test('all artifact types expose ID addresses while directories and APIs retain slugs', async () => {
  const { root, request } = await start();
  writeHtml(root, 'demo', { 'index.html': '<title>HTML demo</title>' });
  writeDocument(root, 'spec', { 'doc.xml': '<doc><h1>Document spec</h1></doc>' });
  writeArtboard(root, 'review', { version: 1, title: 'Artboard review', pages: [], boards: {} });
  const list = JSON.parse((await request('/api/artifacts')).body);
  expect(list.artifacts).toHaveLength(3);
  for (const item of list.artifacts) {
    expect(item.url).toMatch(new RegExp(`^/${item.type}/[A-Za-z0-9]{21}$`));
    expect(fs.existsSync(path.join(root, item.type, item.id))).toBe(true);
    expect((await request(`/api/artifacts/${item.type}/${item.id}`)).status).toBe(200);
    const page = await request(item.url);
    expect(page.status).toBe(200);
    expect(page.body).toContain(`data-ryugi-artifact-id="${item.id}"`);
    expect(page.body).toContain(`<title>${item.title}</title>`);
    expect(new URL(server!.linkFor(item.type, item.id)).pathname).toBe(item.url);
    const legacy = await request(`/${item.type}/${item.id}`);
    expect(legacy.body).toContain(
      `rel="canonical" href="http://localhost:${server!.port}${item.url}"`,
    );
    const preview = await request(`/preview${item.url}`);
    expect(preview.body).toContain(`data-ryugi-artifact-id="${item.id}"`);
    expect(preview.body).toContain(`/preview${item.url}`);
  }
});

test('an address survives content edits, a slug directory rename and a server restart', async () => {
  const first = await start();
  const dir = writeHtml(first.root, 'original', { 'index.html': '<title>Before</title>' });
  const link = server!.linkFor('html', 'original');
  const pathname = new URL(link).pathname;
  fs.writeFileSync(path.join(dir, 'index.html'), '<title>After</title>');
  expect(server!.linkFor('html', 'original')).toBe(link);
  fs.renameSync(dir, path.join(first.root, 'html', 'renamed'));
  await server!.close();
  server = undefined;
  const second = await start(first.root);
  expect(new URL(server!.linkFor('html', 'renamed')).pathname).toBe(pathname);
  const page = await second.request(pathname);
  expect(page.body).toContain('<title>After</title>');
  expect(page.body).toContain('data-ryugi-artifact-id="renamed"');
  expect(fs.existsSync(path.join(first.root, 'html', 'original'))).toBe(false);
});

test('a 32-character hex ID written by an older release still resolves', async () => {
  const { root, request } = await start();
  const legacy = '0123456789abcdef0123456789abcdef';
  const dir = writeHtml(root, 'legacy', {
    'index.html': '<title>Legacy</title>',
    '.artifact-id': `${legacy}\n`,
  });
  const page = await request(`/html/${legacy}`);
  expect(page.status).toBe(200);
  expect(page.body).toContain(
    `rel="canonical" href="http://localhost:${server!.port}/html/${legacy}"`,
  );
  expect(new URL(server!.linkFor('html', 'legacy')).pathname).toBe(`/html/${legacy}`);
  expect(fs.readFileSync(path.join(dir, '.artifact-id'), 'utf8')).toBe(`${legacy}\n`);
});

test('IDs written before the alphabet changed still resolve', async () => {
  const { root, request } = await start();
  const cases = [
    ['cloud-shaped', 'V1StGXR8_Z5jdHi6B-myT'],
    ['trailing-underscore', 'V1StGXR8_Z5jdHi6B-my_'],
  ] as const;
  for (const [slug, address] of cases) {
    const dir = writeHtml(root, slug, {
      'index.html': `<title>${slug}</title>`,
      '.artifact-id': `${address}\n`,
    });
    for (const prefix of ['', '/preview']) {
      const page = await request(`${prefix}/html/${address}`);
      expect(page.status, `${prefix}/html/${address}`).toBe(200);
      expect(page.body).toContain(
        `rel="canonical" href="http://localhost:${server!.port}${prefix}/html/${address}"`,
      );
      expect(page.body).toContain(`data-ryugi-artifact-id="${slug}"`);
    }
    expect(new URL(server!.linkFor('html', slug)).pathname).toBe(`/html/${address}`);
    expect(fs.readFileSync(path.join(dir, '.artifact-id'), 'utf8')).toBe(`${address}\n`);
  }
});

test('damaged identity metadata is reported without replacing it', async () => {
  const { root, request } = await start();
  const dir = writeHtml(root, 'demo', {
    'index.html': '<title>Demo</title>',
    '.artifact-id': 'broken\n',
  });
  const result = await request('/html/demo');
  expect(result.status).toBe(500);
  expect(fs.readFileSync(path.join(dir, '.artifact-id'), 'utf8')).toBe('broken\n');
});

test('a copied identity never silently opens a different artifact', async () => {
  const { root, request } = await start();
  const dir = writeHtml(root, 'original', { 'index.html': '<title>Original</title>' });
  const pathname = new URL(server!.linkFor('html', 'original')).pathname;
  fs.cpSync(dir, path.join(root, 'html', 'copy'), { recursive: true });
  const result = await request(pathname);
  expect(result.status).toBe(500);
  expect(result.body).toContain('Duplicate artifact ID');
});
