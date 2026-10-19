import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { startArtboardServer, type ArtboardServer } from '../src/server/app';
import { get, openWs, tempBoardDir, waitFor, writeBoard } from './helpers';

const canvas = {
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
};

let running: ArtboardServer[] = [];

async function start(overrides: { dir?: string; viewer?: string } = {}) {
  const temp = tempBoardDir();
  const server = await startArtboardServer({
    boardDir: overrides.dir ?? temp.dir,
    viewerDir: overrides.viewer ?? temp.viewer,
    host: '127.0.0.1',
    urlHost: 'localhost',
  });
  running.push(server);
  return { server, dir: overrides.dir ?? temp.dir, viewer: overrides.viewer ?? temp.viewer };
}

const base = (s: ArtboardServer) => `http://127.0.0.1:${s.port}`;
const cookie = (s: ArtboardServer) => `artboard_${s.port}=${s.token}`;

afterEach(async () => {
  await Promise.all(running.map((s) => s.close()));
  running = [];
});

describe('session key', () => {
  test('the viewer page is refused without the key', async () => {
    const { server } = await start();
    expect((await get(`${base(server)}/`)).status).toBe(403);
  });

  test('the key in the URL serves the viewer and sets a per-port cookie', async () => {
    const { server } = await start();
    const res = await get(`${base(server)}/?key=${server.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('<title>viewer</title>');
    expect(String(res.headers['set-cookie'])).toContain(`artboard_${server.port}=${server.token}`);
    expect(String(res.headers['set-cookie'])).toContain('HttpOnly');
  });

  test('the cookie authorizes viewer assets and the canvas API', async () => {
    const { server } = await start();
    expect((await get(`${base(server)}/assets/app.js`, { Cookie: cookie(server) })).status).toBe(200);
    expect((await get(`${base(server)}/assets/app.js`)).status).toBe(403);
    expect((await get(`${base(server)}/api/canvas`)).status).toBe(403);
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

  test('the viewer page forbids loading anything from other hosts', async () => {
    const { server } = await start();
    const csp = String((await get(`${base(server)}/?key=${server.token}`)).headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/https?:/);
  });

  test('the url carries the key and the display host', async () => {
    const { server } = await start();
    expect(server.url).toBe(`http://localhost:${server.port}/?key=${server.token}`);
  });
});

describe('canvas API', () => {
  test('reports each board file modification time for cache-busting', async () => {
    const { server, dir } = await start();
    writeBoard(dir, canvas, { 'pages/p/a.html': '<p>a</p>' });
    const payload = JSON.parse((await get(`${base(server)}/api/canvas`, { Cookie: cookie(server) })).body);
    expect(payload.versions['pages/p/a.html']).toBe(fs.statSync(path.join(dir, 'pages/p/a.html')).mtimeMs);
  });

  test('withholds a structurally invalid canvas and reports why', async () => {
    const { server, dir } = await start();
    writeBoard(dir, { ...canvas, groups: { g: { members: ['a'] } } }, { 'pages/p/a.html': '<p>a</p>' });
    const payload = JSON.parse((await get(`${base(server)}/api/canvas`, { Cookie: cookie(server) })).body);
    expect(payload.canvas).toBeNull();
    expect(payload.warnings).toContain('group "g" needs a "boards" array');
  });

  test('returns canvas, warnings, layout and the board path prefix', async () => {
    const { server, dir } = await start();
    writeBoard(dir, canvas, { 'pages/p/a.html': '<p>a</p>' });
    const res = await get(`${base(server)}/api/canvas`, { Cookie: cookie(server) });
    const payload = JSON.parse(res.body);
    expect(payload.canvas.boards.a.w).toBe(640);
    expect(payload.warnings).toEqual([]);
    expect(payload.layout.pages.p.bounds).toEqual({ minX: 0, minY: -32, maxX: 640, maxY: 400 });
    expect(payload.boardBase).toBe(`/b/${server.boardToken}/`);
  });

  test('reports invalid JSON as a warning', async () => {
    const { server, dir } = await start();
    fs.writeFileSync(path.join(dir, 'canvas.json'), '{ nope');
    const payload = JSON.parse((await get(`${base(server)}/api/canvas`, { Cookie: cookie(server) })).body);
    expect(payload.canvas).toBeNull();
    expect(payload.warnings[0]).toMatch(/not valid JSON/);
  });

  test('reports a missing canvas.json', async () => {
    const { server } = await start();
    const payload = JSON.parse((await get(`${base(server)}/api/canvas`, { Cookie: cookie(server) })).body);
    expect(payload.warnings).toEqual(['canvas.json not found']);
  });
});

describe('board files', () => {
  test('are served under the board token without the session key', async () => {
    const { server, dir } = await start();
    writeBoard(dir, canvas, { 'pages/p/a.html': '<p>a</p>' });
    const res = await get(`${base(server)}/b/${server.boardToken}/pages/p/a.html`);
    expect(res.status).toBe(200);
    expect(res.body).toBe('<p>a</p>');
    expect(res.headers['content-type']).toContain('text/html');
  });

  test('are refused with a wrong board token', async () => {
    const { server, dir } = await start();
    writeBoard(dir, canvas, { 'pages/p/a.html': '<p>a</p>' });
    expect((await get(`${base(server)}/b/wrong/pages/p/a.html`)).status).toBe(404);
  });

  test('are sandboxed by CSP even when opened as a top-level page', async () => {
    const { server, dir } = await start();
    writeBoard(dir, canvas, { 'pages/p/a.html': '<p>a</p>' });
    const res = await get(`${base(server)}/b/${server.boardToken}/pages/p/a.html`);
    expect(res.headers['content-security-policy']).toBe('sandbox allow-scripts');
  });

  test('only serve files under pages/, whatever the letter case or route', async () => {
    const { server, dir } = await start();
    writeBoard(dir, canvas, { 'pages/p/a.html': '<p>a</p>' });
    const prefix = `${base(server)}/b/${server.boardToken}`;
    for (const rel of ['State/.last-token', 'STATE/server-info', 'pages/../State/.last-token', 'canvas.json']) {
      const res = await get(`${prefix}/${rel}`);
      expect(res.status, rel).not.toBe(200);
      expect(res.body).not.toContain(server.token);
    }
  });

  test('refuse a symlink inside pages/ that points at the state directory', async () => {
    const { server, dir } = await start();
    writeBoard(dir, canvas, { 'pages/p/a.html': '<p>a</p>' });
    fs.symlinkSync(path.join(dir, 'state'), path.join(dir, 'pages', 'leak'));
    const res = await get(`${base(server)}/b/${server.boardToken}/pages/leak/.last-token`);
    expect(res.status).not.toBe(200);
  });

  test('never expose the state directory or escape the board directory', async () => {
    const { server, dir } = await start();
    writeBoard(dir, canvas, { 'pages/p/a.html': '<p>a</p>' });
    const prefix = `${base(server)}/b/${server.boardToken}`;
    expect((await get(`${prefix}/state/server-info`)).status).toBe(403);
    expect((await get(`${prefix}/..%2f..%2fetc%2fpasswd`)).status).toBe(403);
  });
});

describe('state files', () => {
  test('warnings.json and layout.json are written at startup', async () => {
    const { dir } = await start();
    const warnings = JSON.parse(fs.readFileSync(path.join(dir, 'state', 'warnings.json'), 'utf8'));
    expect(warnings.warnings).toEqual(['canvas.json not found']);
    expect(typeof warnings.checkedAt).toBe('string');
    expect(fs.existsSync(path.join(dir, 'state', 'layout.json'))).toBe(true);
  });

  test('a change to the board rewrites warnings.json with a newer checkedAt', async () => {
    const { dir } = await start();
    const file = path.join(dir, 'state', 'warnings.json');
    const before = JSON.parse(fs.readFileSync(file, 'utf8')).checkedAt;
    await new Promise((r) => setTimeout(r, 20));
    writeBoard(dir, canvas, { 'pages/p/a.html': '<p>a</p>' });
    await waitFor(() => JSON.parse(fs.readFileSync(file, 'utf8')).checkedAt !== before);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).warnings).toEqual([]);
    const layout = JSON.parse(fs.readFileSync(path.join(dir, 'state', 'layout.json'), 'utf8'));
    expect(layout.pages.p.bounds.maxX).toBe(640);
  });

  test('server-info holds the url and board directory', async () => {
    const { server, dir } = await start();
    const info = JSON.parse(fs.readFileSync(path.join(dir, 'state', 'server-info'), 'utf8'));
    expect(info).toMatchObject({ type: 'server-started', url: server.url, port: server.port, dir });
  });
});

describe('websocket', () => {
  const origin = (s: ArtboardServer) => `http://127.0.0.1:${s.port}`;

  test('is refused without the session cookie', async () => {
    const { server } = await start();
    const ws = await openWs(server.port, { Origin: origin(server), Host: `127.0.0.1:${server.port}` });
    expect(ws.status).toBe(403);
  });

  test('is refused from a foreign origin', async () => {
    const { server } = await start();
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: 'http://evil.test' });
    expect(ws.status).toBe(403);
  });

  test('is refused from an opaque (sandboxed board) origin', async () => {
    const { server } = await start();
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: 'null' });
    expect(ws.status).toBe(403);
  });

  test('accepts an https origin for the same host, as behind a forwarding proxy', async () => {
    const { server } = await start();
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: `https://127.0.0.1:${server.port}` });
    expect(ws.status).toBe(101);
    ws.socket?.destroy();
  });

  test('pushes a change message naming the file the agent wrote', async () => {
    const { server, dir } = await start();
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    expect(ws.status).toBe(101);
    writeBoard(dir, canvas, { 'pages/p/a.html': '<p>a</p>' });
    await waitFor(() => ws.messages.some((m) => m.includes('pages/p/a.html')));
    const message = JSON.parse(ws.messages.find((m) => m.includes('pages/p/a.html'))!);
    expect(message.type).toBe('change');
    ws.socket?.destroy();
  });
});

describe('malformed canvas', () => {
  test('a pages entry that is not an object keeps the server alive and becomes a warning', async () => {
    const { server, dir } = await start();
    const file = path.join(dir, 'state', 'warnings.json');
    const before = JSON.parse(fs.readFileSync(file, 'utf8')).checkedAt;
    await new Promise((r) => setTimeout(r, 20));
    fs.writeFileSync(path.join(dir, 'canvas.json'), JSON.stringify({ version: 1, pages: [null], boards: {} }));
    await waitFor(() => JSON.parse(fs.readFileSync(file, 'utf8')).checkedAt !== before);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).warnings).toContain('pages[0] needs string "id" and "name"');
    const res = await get(`${base(server)}/api/canvas`, { Cookie: cookie(server) });
    expect(res.status).toBe(200);
  });
});

describe('restart', () => {
  test('reuses the previous port and key for the same board directory', async () => {
    const first = await start();
    const { port, token } = first.server;
    await first.server.close();
    running = running.filter((s) => s !== first.server);
    const second = await start({ dir: first.dir, viewer: first.viewer });
    expect(second.server.port).toBe(port);
    expect(second.server.token).toBe(token);
  });
});
