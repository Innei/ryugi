import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { startArtifactsServer, type ArtifactsServer } from '../src/server/app';
import { get, openWs, readJson, tempRoot, waitFor, writeArtboard, writeHtml } from './helpers';

const canvas = {
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
};

let running: ArtifactsServer[] = [];

async function start(overrides: { root?: string; viewer?: string } = {}) {
  const temp = tempRoot();
  const root = overrides.root ?? temp.root;
  const viewer = overrides.viewer ?? temp.viewer;
  const server = await startArtifactsServer({ root, viewerDir: viewer, host: '127.0.0.1', urlHost: 'localhost' });
  running.push(server);
  return { server, root, viewer };
}

const base = (s: ArtifactsServer) => `http://127.0.0.1:${s.port}`;
const cookie = (s: ArtifactsServer) => `ryugi_artifacts_${s.port}=${s.token}`;
const api = async (s: ArtifactsServer, rel: string) => JSON.parse((await get(`${base(s)}${rel}`, { Cookie: cookie(s) })).body);
const content = (s: ArtifactsServer, rel: string) => get(`${base(s)}/c/${s.contentToken}/${rel}`);
const stateFile = (root: string, ...rel: string[]) => path.join(root, '.state', ...rel);

afterEach(async () => {
  await Promise.all(running.map((s) => s.close()));
  running = [];
});

describe('session key', () => {
  test('the shell is refused without the key', async () => {
    const { server } = await start();
    expect((await get(`${base(server)}/`)).status).toBe(403);
    expect((await get(`${base(server)}/html/x`)).status).toBe(403);
  });

  test('the key serves the shell at the root and at an artifact link, and sets a per-port cookie', async () => {
    const { server } = await start();
    for (const rel of ['/', '/html/arrow-tuner', '/artboard/brainstorm/']) {
      const res = await get(`${base(server)}${rel}?key=${server.token}`);
      expect(res.status, rel).toBe(200);
      expect(res.body).toContain('<title>viewer</title>');
      expect(String(res.headers['set-cookie'])).toContain(`ryugi_artifacts_${server.port}=${server.token}`);
      expect(String(res.headers['set-cookie'])).toContain('HttpOnly');
    }
  });

  test('the cookie authorizes viewer assets and the API', async () => {
    const { server } = await start();
    expect((await get(`${base(server)}/assets/app.js`, { Cookie: cookie(server) })).status).toBe(200);
    expect((await get(`${base(server)}/assets/app.js`)).status).toBe(403);
    expect((await get(`${base(server)}/api/artifacts`)).status).toBe(403);
  });

  test('a wrong key is refused', async () => {
    const { server } = await start();
    expect((await get(`${base(server)}/?key=nope`)).status).toBe(403);
  });

  test('every response sends Referrer-Policy: no-referrer', async () => {
    const { server } = await start();
    expect((await get(`${base(server)}/`)).headers['referrer-policy']).toBe('no-referrer');
    expect((await get(`${base(server)}/?key=${server.token}`)).headers['referrer-policy']).toBe('no-referrer');
  });

  test('the shell forbids loading anything from other hosts', async () => {
    const { server } = await start();
    const csp = String((await get(`${base(server)}/?key=${server.token}`)).headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/https?:/);
  });

  test('the url and artifact links carry the key and the display host', async () => {
    const { server } = await start();
    expect(server.url).toBe(`http://localhost:${server.port}/?key=${server.token}`);
    expect(server.linkFor('html', 'arrow-tuner')).toBe(`http://localhost:${server.port}/html/arrow-tuner?key=${server.token}`);
  });
});

describe('artifact list API', () => {
  test('lists every artifact with its title', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'brainstorm', { ...canvas, title: 'Header ideas' }, { 'pages/p/a.html': '<p>a</p>' });
    writeHtml(root, 'arrow-tuner', { 'index.html': '<title>Arrow tuner</title><p>x</p>' });
    writeHtml(root, 'untitled', { 'index.html': '<p>x</p>' });
    const list = await api(server, '/api/artifacts');
    expect(list.artifacts).toEqual([
      { type: 'artboard', id: 'brainstorm', title: 'Header ideas' },
      { type: 'html', id: 'arrow-tuner', title: 'Arrow tuner' },
      { type: 'html', id: 'untitled', title: 'untitled' },
    ]);
  });
});

describe('artboard API', () => {
  test('returns canvas, warnings, layout and the content path prefix', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
    const payload = await api(server, '/api/artifacts/artboard/b1');
    expect(payload.canvas.boards.a.w).toBe(640);
    expect(payload.warnings).toEqual([]);
    expect(payload.layout.pages.p.bounds).toEqual({ minX: 0, minY: -32, maxX: 640, maxY: 400 });
    expect(payload.contentBase).toBe(`/c/${server.contentToken}/artboard/b1/`);
  });

  test('reports each board file modification time for cache-busting', async () => {
    const { server, root } = await start();
    const dir = writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
    const payload = await api(server, '/api/artifacts/artboard/b1');
    expect(payload.versions['pages/p/a.html']).toBe(fs.statSync(path.join(dir, 'pages/p/a.html')).mtimeMs);
  });

  test('withholds a structurally invalid canvas and reports why', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'b1', { ...canvas, groups: { g: { members: ['a'] } } }, { 'pages/p/a.html': '<p>a</p>' });
    const payload = await api(server, '/api/artifacts/artboard/b1');
    expect(payload.canvas).toBeNull();
    expect(payload.warnings).toContain('group "g" needs a "boards" array');
  });

  test('reports invalid JSON and a missing canvas.json as warnings', async () => {
    const { server, root } = await start();
    fs.mkdirSync(path.join(root, 'artboard', 'bad'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artboard', 'bad', 'canvas.json'), '{ nope');
    fs.mkdirSync(path.join(root, 'artboard', 'empty'), { recursive: true });
    expect((await api(server, '/api/artifacts/artboard/bad')).warnings[0]).toMatch(/not valid JSON/);
    expect((await api(server, '/api/artifacts/artboard/empty')).warnings).toEqual(['canvas.json not found']);
  });

  test('an unknown artifact is a 404 with a warning', async () => {
    const { server } = await start();
    const res = await get(`${base(server)}/api/artifacts/artboard/missing`, { Cookie: cookie(server) });
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).warnings[0]).toMatch(/not found/);
  });
});

describe('html API', () => {
  test('returns the title, a version and the content path prefix', async () => {
    const { server, root } = await start();
    writeHtml(root, 'tuner', { 'index.html': '<title>Tuner</title>', 'img/a.png': 'png' });
    const payload = await api(server, '/api/artifacts/html/tuner');
    expect(payload.title).toBe('Tuner');
    expect(payload.warnings).toEqual([]);
    expect(typeof payload.version).toBe('number');
    expect(payload.contentBase).toBe(`/c/${server.contentToken}/html/tuner/`);
  });

  test('a missing index.html is a warning', async () => {
    const { server, root } = await start();
    writeHtml(root, 'tuner', { 'other.html': '<p>x</p>' });
    expect((await api(server, '/api/artifacts/html/tuner')).warnings).toEqual(['index.html not found']);
  });

  test('the version changes when any file in the artifact changes', async () => {
    const { server, root } = await start();
    const dir = writeHtml(root, 'tuner', { 'index.html': '<p>x</p>', 'img/a.png': 'png' });
    const before = (await api(server, '/api/artifacts/html/tuner')).version;
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(path.join(dir, 'img/a.png'), later, later);
    expect((await api(server, '/api/artifacts/html/tuner')).version).not.toBe(before);
  });
});

describe('artboard content', () => {
  test('board files are served under the content token without the session key', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
    const res = await content(server, 'artboard/b1/pages/p/a.html');
    expect(res.status).toBe(200);
    expect(res.body).toBe('<p>a</p>');
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toBe('sandbox allow-scripts');
  });

  test('a wrong content token is refused', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
    expect((await get(`${base(server)}/c/wrong/artboard/b1/pages/p/a.html`)).status).toBe(404);
  });

  test('only files under pages/ are served', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
    expect((await content(server, 'artboard/b1/canvas.json')).status).not.toBe(200);
  });

  test('a symlink inside pages/ pointing at the state directory is refused', async () => {
    const { server, root } = await start();
    const dir = writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
    fs.symlinkSync(path.join(root, '.state'), path.join(dir, 'pages', 'leak'));
    const res = await content(server, 'artboard/b1/pages/leak/.last-token');
    expect(res.status).not.toBe(200);
    expect(res.body).not.toContain(server.token);
  });
});

describe('html content', () => {
  test('files are served with a sandbox that allows scripts, modals, forms, popups and downloads only', async () => {
    const { server, root } = await start();
    writeHtml(root, 'tuner', { 'index.html': '<p>x</p>', 'img/a.png': 'png' });
    const res = await content(server, 'html/tuner/index.html');
    expect(res.status).toBe(200);
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toBe('sandbox allow-scripts allow-modals allow-forms allow-popups allow-downloads');
    expect(csp).not.toContain('allow-same-origin');
    expect((await content(server, 'html/tuner/img/a.png')).status).toBe(200);
  });

  test('dotfiles, the state directory and other artifacts are never served', async () => {
    const { server, root } = await start();
    writeHtml(root, 'tuner', { 'index.html': '<p>x</p>', '.secret': 'x' });
    writeHtml(root, 'other', { 'index.html': '<p>other</p>' });
    for (const rel of [
      'html/tuner/.secret',
      'html/tuner/..%2fother%2findex.html',
      'html/tuner/../../.state/.last-token',
      'html/.state/.last-token',
      '.state/.last-token',
      'html/tuner/%2e%2e/%2e%2e/.state/.last-token',
    ]) {
      const res = await content(server, rel);
      expect(res.status, rel).not.toBe(200);
      expect(res.body).not.toContain(server.token);
    }
  });

  test('a symlink out of the artifact directory is refused', async () => {
    const { server, root } = await start();
    const dir = writeHtml(root, 'tuner', { 'index.html': '<p>x</p>' });
    fs.symlinkSync(path.join(root, '.state'), path.join(dir, 'leak'));
    const res = await content(server, 'html/tuner/leak/.last-token');
    expect(res.status).not.toBe(200);
  });
});

describe('state files', () => {
  test('the state directory ignores itself in git', async () => {
    const { root } = await start();
    expect(fs.readFileSync(stateFile(root, '.gitignore'), 'utf8').trim()).toBe('*');
  });

  test('per-artifact warnings and artboard layout are written at startup', async () => {
    const temp = tempRoot();
    writeArtboard(temp.root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
    writeHtml(temp.root, 'tuner', { 'other.html': 'x' });
    await start(temp);
    const artboard = readJson(stateFile(temp.root, 'artboard', 'b1', 'warnings.json'));
    expect(artboard.warnings).toEqual([]);
    expect(typeof artboard.checkedAt).toBe('string');
    expect(readJson(stateFile(temp.root, 'artboard', 'b1', 'layout.json')).pages.p.bounds.maxX).toBe(640);
    expect(readJson(stateFile(temp.root, 'html', 'tuner', 'warnings.json')).warnings).toEqual(['index.html not found']);
  });

  test('a change rewrites only that artifact\'s warnings with a newer checkedAt', async () => {
    const { root } = await start();
    writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
    const file = stateFile(root, 'artboard', 'b1', 'warnings.json');
    await waitFor(() => fs.existsSync(file));
    const before = readJson(file).checkedAt;
    await new Promise((r) => setTimeout(r, 20));
    writeArtboard(root, 'b1', { ...canvas, pages: [{ id: 'q', name: 'Q' }] });
    await waitFor(() => readJson(file).checkedAt !== before);
    expect(readJson(file).warnings.length).toBeGreaterThan(0);
  });

  test('server-info holds the url and the artifacts root', async () => {
    const { server, root } = await start();
    expect(readJson(stateFile(root, 'server-info'))).toMatchObject({
      type: 'server-started',
      url: server.url,
      port: server.port,
      root,
    });
  });

  test('state is never served, whatever the letter case', async () => {
    const { server } = await start();
    for (const rel of ['.state/.last-token', '.State/.last-token', 'STATE/server-info']) {
      const res = await get(`${base(server)}/${rel}`, { Cookie: cookie(server) });
      expect(res.status, rel).not.toBe(200);
      expect(res.body).not.toContain(server.token);
    }
  });
});

describe('websocket', () => {
  const origin = (s: ArtifactsServer) => `http://127.0.0.1:${s.port}`;

  test('is refused without the session cookie', async () => {
    const { server } = await start();
    const ws = await openWs(server.port, { Origin: origin(server), Host: `127.0.0.1:${server.port}` });
    expect(ws.status).toBe(403);
  });

  test('is refused from a foreign or opaque origin', async () => {
    const { server } = await start();
    expect((await openWs(server.port, { Cookie: cookie(server), Origin: 'http://evil.test' })).status).toBe(403);
    expect((await openWs(server.port, { Cookie: cookie(server), Origin: 'null' })).status).toBe(403);
  });

  test('accepts an https origin for the same host, as behind a forwarding proxy', async () => {
    const { server } = await start();
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: `https://127.0.0.1:${server.port}` });
    expect(ws.status).toBe(101);
    ws.socket?.destroy();
  });

  test('pushes a change message naming the artifact and the file the agent wrote', async () => {
    const { server, root } = await start();
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    expect(ws.status).toBe(101);
    writeHtml(root, 'tuner', { 'index.html': '<p>x</p>' });
    await waitFor(() => ws.messages.some((m) => m.includes('"html/tuner"') && m.includes('index.html')));
    const message = JSON.parse(ws.messages.find((m) => m.includes('"html/tuner"'))!);
    expect(message).toMatchObject({ type: 'change', artifact: 'html/tuner' });
    expect(message.files).toContain('index.html');
    ws.socket?.destroy();
  });
  test('sends one change per real change, even when the backup poll sees it again', async () => {
    const { server, root } = await start();
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    writeHtml(root, 'tuner', { 'index.html': '<p>x</p>' });
    await waitFor(() => ws.messages.some((m) => m.includes('"html/tuner"')));
    await new Promise((r) => setTimeout(r, 1500));
    expect(ws.messages.filter((m) => m.includes('"html/tuner"'))).toHaveLength(1);
    ws.socket?.destroy();
  });
});

describe('malformed canvas', () => {
  test('a pages entry that is not an object keeps the server alive and becomes a warning', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'b1', { version: 1, pages: [null], boards: {} });
    const file = stateFile(root, 'artboard', 'b1', 'warnings.json');
    await waitFor(() => fs.existsSync(file) && readJson(file).warnings.includes('pages[0] needs string "id" and "name"'));
    expect((await get(`${base(server)}/api/artifacts/artboard/b1`, { Cookie: cookie(server) })).status).toBe(200);
  });
});

describe('restart', () => {
  test('reuses the previous port and key for the same artifacts root', async () => {
    const first = await start();
    const { port, token } = first.server;
    await first.server.close();
    running = running.filter((s) => s !== first.server);
    const second = await start({ root: first.root, viewer: first.viewer });
    expect(second.server.port).toBe(port);
    expect(second.server.token).toBe(token);
  });
});
