import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { startArtifactsServer, type ArtifactsServer } from '../src/server/app';
import { typeFaviconHref } from '../src/shared/type-icons';
import { get, openWs, readJson, sendWsText, tempRoot, waitFor, writeArtboard, writeDocument, writeHtml } from './helpers';

const canvas = {
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
};

let running: ArtifactsServer[] = [];

async function start(overrides: { root?: string; viewer?: string; runtime?: string; fetch?: typeof fetch } = {}) {
  const temp = tempRoot();
  const root = overrides.root ?? temp.root;
  const viewer = overrides.viewer ?? temp.viewer;
  const runtime = overrides.runtime ?? temp.runtime;
  const server = await startArtifactsServer({
    root,
    viewerDir: viewer,
    runtimeDir: runtime,
    host: '127.0.0.1',
    urlHost: 'localhost',
    fetch: overrides.fetch,
  });
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
    for (const rel of ['/', '/html/arrow-tuner', '/artboard/brainstorm/', '/document/relay-sync']) {
      const res = await get(`${base(server)}${rel}?key=${server.token}`);
      expect(res.status, rel).toBe(200);
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
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

  test('avatars go through the server, behind the key, and only for ids it can map', async () => {
    const upstream: string[] = [];
    const fetch = (async (url: string) => {
      upstream.push(url);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } });
    }) as unknown as typeof globalThis.fetch;
    const { server } = await start({ fetch });
    const ok = await get(`${base(server)}/api/avatar/github/innei?key=${server.token}`);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('image/png');
    expect(upstream).toEqual(['https://avatars.githubusercontent.com/innei?s=64']);
    expect((await get(`${base(server)}/api/avatar/github/innei`)).status).toBe(403);
    expect((await get(`${base(server)}/api/avatar/github/..%2Fetc?key=${server.token}`)).status).toBe(404);
    expect((await get(`${base(server)}/api/avatar/elsewhere/innei?key=${server.token}`)).status).toBe(404);
  });

  test('the shell forbids loading anything from other hosts', async () => {
    const { server } = await start();
    const csp = String((await get(`${base(server)}/?key=${server.token}`)).headers['content-security-policy']);
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toMatch(/https?:/);
  });

  test('the shell lets the viewer compile WebAssembly, which the document CRDT needs, and nothing else eval-like', async () => {
    const { server } = await start();
    const csp = String((await get(`${base(server)}/?key=${server.token}`)).headers['content-security-policy']);
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test('the shell runs its own inline scripts by hash, so the theme is set before the first paint', async () => {
    const { server, viewer } = await start();
    const script = "document.documentElement.dataset.theme = 'dark';";
    fs.writeFileSync(path.join(viewer, 'index.html'), `<!doctype html><head><script>${script}</script><script type="module" src="/index.js"></script></head>`);
    const hash = createHash('sha256').update(script).digest('base64');
    for (const route of ['/', '/preview/html/tuner']) {
      const csp = String((await get(`${base(server)}${route}?key=${server.token}`)).headers['content-security-policy']);
      expect(csp).toContain(`script-src 'self' 'wasm-unsafe-eval' 'sha256-${hash}';`);
      expect(csp).not.toContain("'unsafe-inline' ");
    }
  });

  test('the shell lets a document point <base> at its own content route, so assets/ paths resolve', async () => {
    const { server } = await start();
    const csp = String((await get(`${base(server)}/document/doc?key=${server.token}`)).headers['content-security-policy']);
    expect(csp).toContain("base-uri 'self'");
  });

  test('the url and artifact links carry the key and the display host', async () => {
    const { server } = await start();
    expect(server.url).toBe(`http://localhost:${server.port}/?key=${server.token}`);
    const link = new URL(server.linkFor('html', 'arrow-tuner'));
    expect(link.origin).toBe(`http://localhost:${server.port}`);
    expect(link.pathname).toMatch(/^\/html\/[A-Za-z0-9]{21}$/);
    expect(link.searchParams.get('key')).toBe(server.token);
  });
});

describe('status API', () => {
  const status = async (s: ArtifactsServer, key = s.token) => {
    const res = await get(`${base(s)}/api/status?key=${key}`);
    return { status: res.status, json: res.status === 200 ? JSON.parse(res.body) : null };
  };

  test('is refused without the key', async () => {
    const { server } = await start();
    expect((await status(server, 'wrong')).status).toBe(403);
  });

  test('reports the pid, open tabs and last activity', async () => {
    const { server } = await start();
    const before = (await status(server)).json;
    expect(before).toMatchObject({ pid: process.pid, clients: 0 });
    expect(before.startedAt).toBeLessThanOrEqual(Date.now());
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: base(server) });
    expect((await status(server)).json.clients).toBe(1);
    ws.socket?.destroy();
  });

  test('polling it does not count as activity', async () => {
    const { server } = await start();
    let touched = 0;
    server.onActivity(() => touched++);
    const first = (await status(server)).json.lastActivity;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await status(server)).json.lastActivity).toBe(first);
    expect(touched).toBe(0);
    await api(server, '/api/artifacts');
    expect((await status(server)).json.lastActivity).toBeGreaterThan(first);
  });
});

describe('page metadata', () => {
  test('serves crawler rules without a session while keeping artifacts behind authentication', async () => {
    const { server } = await start({ viewer: path.resolve(__dirname, '../dist/viewer') });
    const robots = await get(`${base(server)}/robots.txt`);
    expect(robots.status).toBe(200);
    expect(robots.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(robots.body).not.toContain(server.token);
    expect((await get(`${base(server)}/`)).status).toBe(403);
    expect((await get(`${base(server)}/html/private`)).status).toBe(403);
  });

  test('serves each page title and description before JavaScript runs, with key-free canonical and sharing URLs', async () => {
    const temp = tempRoot();
    const { server, root } = await start({ root: path.join(temp.root, 'test-project/.ryugi/artifacts'), viewer: path.resolve(__dirname, '../dist/viewer') });
    writeArtboard(root, 'ideas', { ...canvas, title: 'Header ideas' }, { 'pages/p/a.html': '<p>Idea</p>' });
    writeDocument(root, 'plan', { 'doc.xml': '<doc><h1>Shipping plan</h1><p>Plan</p></doc>' });
    writeHtml(root, 'tuner', { 'index.html': '<title>Arrow tuner</title><p>Tuner</p>' });
    fs.writeFileSync(path.join(root, 'artboard/ideas/.artifact-id'), 'a'.repeat(32));
    fs.writeFileSync(path.join(root, 'document/plan/.artifact-id'), 'b'.repeat(32));
    fs.writeFileSync(path.join(root, 'html/tuner/.artifact-id'), 'c'.repeat(32));
    for (const [route, title, canonical] of [['/', 'test-project · Artifacts', '/'], ['/artboard/ideas', 'Header ideas', `/artboard/${'a'.repeat(32)}`], ['/document/plan', 'Shipping plan', `/document/${'b'.repeat(32)}`], ['/html/tuner', 'Arrow tuner', `/html/${'c'.repeat(32)}`]]) {
      const response = await get(`${base(server)}${route}?key=${server.token}&tracking=private`);
      expect(response.status).toBe(200);
      expect(response.body).toContain(`<title>${title}</title>`);
      expect(response.body).toContain(`<meta property="og:title" content="${title}">`);
      expect(response.body).toContain(`<meta name="twitter:title" content="${title}">`);
      expect(response.body.match(/<meta name="description"/g)).toHaveLength(1);
      expect(response.body.match(/<meta name="robots"/g)).toHaveLength(1);
      expect(response.body).toMatch(/<meta name="description" content="[^"]*test-project[^"]*">/);
      expect(response.body).toContain(`<link rel="canonical" href="http://localhost:${server.port}${canonical}">`);
      expect(response.body).toContain(`<meta property="og:url" content="http://localhost:${server.port}${canonical}">`);
      expect(response.body).not.toContain(server.token);
      expect(response.body).not.toContain('tracking=private');
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(response.body).toContain('<meta name="robots" content="noindex, nofollow">');
    }
    const response = await get(`${base(server)}/?key=${server.token}`);
    const image = response.body.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    expect(image).toMatch(new RegExp(`^http://localhost:${server.port}/app-icon-.*\\.png$`));
    expect((await get(image!.replace('localhost', '127.0.0.1'), { Cookie: cookie(server) })).status).toBe(200);
    const icon = response.body.match(/<link rel="icon"[^>]*href="([^"]+)"/)?.[1];
    expect(icon).toBeTruthy();
    expect((await get(new URL(icon!, base(server)).href, { Cookie: cookie(server) })).headers['content-type']).toBe('image/svg+xml');
  });

  test('page language and description follow Accept-Language', async () => {
    const temp = tempRoot();
    const { server } = await start({ root: path.join(temp.root, 'test-project/.ryugi/artifacts'), viewer: path.resolve(__dirname, '../dist/viewer') });
    const english = await get(`${base(server)}/?key=${server.token}`, { 'Accept-Language': 'en-US,en;q=0.9' });
    expect(english.body).toMatch(/<html[^>]* lang="en"/);
    expect(english.body).toMatch(/<meta name="description" content="Browse every artboard[^"]*test-project/);
    const chinese = await get(`${base(server)}/?key=${server.token}`, { 'Accept-Language': 'zh-CN,zh;q=0.9' });
    expect(chinese.body).toMatch(/<html[^>]* lang="zh-CN"/);
    expect(chinese.body).toMatch(/<meta name="description" content="浏览 test-project 项目/);
  });

  test('serves each artifact page with its type favicon before JavaScript runs, and the list with the app icon', async () => {
    const { server, root } = await start({ viewer: path.resolve(__dirname, '../dist/viewer') });
    writeArtboard(root, 'ideas', canvas, { 'pages/p/a.html': '<p>Idea</p>' });
    writeDocument(root, 'plan', { 'doc.xml': '<doc><p>Plan</p></doc>' });
    writeHtml(root, 'tuner', { 'index.html': '<p>Tuner</p>' });
    const iconOf = async (route: string) => (await get(`${base(server)}${route}?key=${server.token}`)).body.match(/<link rel="icon"[^>]*href="([^"]+)"/g)!;
    for (const type of ['artboard', 'document', 'html'] as const) {
      const route = `/${type}/${{ artboard: 'ideas', document: 'plan', html: 'tuner' }[type]}`;
      const links = await iconOf(route);
      expect(links).toHaveLength(1);
      expect(links[0]).toContain(`href="${typeFaviconHref(type).replace(/"/g, '&quot;')}"`);
    }
    const list = await iconOf('/');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatch(/href="\/app-icon-[^"]*\.svg"/);
  });

  test('escapes artifact titles and uses the configured host, including for preview and index aliases', async () => {
    const { server, root } = await start({ viewer: path.resolve(__dirname, '../dist/viewer') });
    writeArtboard(root, 'unsafe', { ...canvas, title: 'Research "A&B" </title><script>alert(1)</script>' }, { 'pages/p/a.html': '<p>Idea</p>' });
    fs.writeFileSync(path.join(root, 'artboard/unsafe/.artifact-id'), 'd'.repeat(32));
    const page = await get(`${base(server)}/preview/artboard/unsafe/?key=${server.token}`, { Host: 'untrusted.example:123' });
    expect(page.body).toContain('<title>Research &quot;A&amp;B&quot; &lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>');
    expect(page.body).not.toContain('<script>alert(1)</script>');
    expect(page.body).not.toContain('untrusted.example');
    expect(page.body).toContain(`<link rel="canonical" href="http://localhost:${server.port}/preview/artboard/${'d'.repeat(32)}">`);
    const index = await get(`${base(server)}/index.html?key=${server.token}`);
    expect(index.body).toContain(`<link rel="canonical" href="http://localhost:${server.port}/">`);
  });
});

describe('artifact list API', () => {
  test('lists every artifact with its title', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'brainstorm', { ...canvas, title: 'Header ideas' }, { 'pages/p/a.html': '<p>a</p>' });
    writeHtml(root, 'arrow-tuner', { 'index.html': '<title>Arrow tuner</title><p>x</p>' });
    writeHtml(root, 'untitled', { 'index.html': '<p>x</p>' });
    writeDocument(root, 'relay-sync', { 'doc.xml': '<doc><p>intro</p><h1 id="a">Relay <b>sync</b></h1></doc>' });
    const list = await api(server, '/api/artifacts');
    expect(list.artifacts).toHaveLength(4);
    expect(list.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'artboard', id: 'brainstorm', title: 'Header ideas' }),
      expect.objectContaining({ type: 'document', id: 'relay-sync', title: 'Relay sync' }),
      expect.objectContaining({ type: 'html', id: 'arrow-tuner', title: 'Arrow tuner' }),
      expect.objectContaining({ type: 'html', id: 'untitled', title: 'untitled' }),
    ]));
  });

  test('names the project and includes asset changes in the update time', async () => {
    const project = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'library-project-'));
    const { server, root } = await start({ root: path.join(project, '.ryugi/artifacts') });
    const dir = writeHtml(root, 'tuner', { 'index.html': '<title>Tuner</title>', 'style.css': 'body{}' });
    fs.utimesSync(path.join(dir, 'index.html'), new Date('2026-01-01'), new Date('2026-01-01'));
    fs.utimesSync(path.join(dir, 'style.css'), new Date('2026-02-01'), new Date('2026-02-01'));
    const list = await api(server, '/api/artifacts');
    expect(list.project).toBe(path.basename(project));
    expect(list.artifacts[0].updatedAt).toBe(Date.parse('2026-02-01'));
  });

  test('notifies the list when an artifact is removed', async () => {
    const { server, root } = await start();
    const dir = writeHtml(root, 'removed', { 'index.html': '<p>before</p>' });
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: base(server) });
    await waitFor(() => fs.existsSync(stateFile(root, 'html/removed/warnings.json')));
    ws.messages.length = 0;
    fs.rmSync(dir, { recursive: true });
    await waitFor(() => ws.messages.some((m) => m.includes('html/removed')));
    expect((await api(server, '/api/artifacts')).artifacts).toEqual([]);
    ws.socket?.destroy();
  });
});

describe('read-only previews', () => {
  test('preview pages load the lightweight entry while normal pages keep the application entry', async () => {
    const { server, viewer } = await start();
    fs.writeFileSync(path.join(viewer, 'preview.html'), '<!doctype html><head><script type="module" src="/preview.js"></script></head><body><div id="root"></div></body>');
    const preview = await get(`${base(server)}/preview/html/tuner?key=${server.token}`);
    expect(preview.body).toContain('src="/preview.js"');
    expect(preview.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    const home = await get(`${base(server)}/?key=${server.token}`);
    expect(home.body).not.toContain('src="/preview.js"');
  });

  test('preview pages require the key and allow embedding only by this viewer', async () => {
    const { server } = await start();
    expect((await get(`${base(server)}/preview/html/tuner`)).status).toBe(403);
    const response = await get(`${base(server)}/preview/html/tuner?key=${server.token}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect((await get(`${base(server)}/?key=${server.token}`)).headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  test('previews the actual document, canvas and HTML without returning raw document markup', async () => {
    const { server, root } = await start();
    writeDocument(root, 'spec', { 'doc.xml': '<doc><h1>Actual design</h1><p>Opening paragraph</p></doc>' });
    writeArtboard(root, 'ideas', canvas, { 'pages/p/a.html': '<p>Actual board</p>' });
    writeHtml(root, 'tuner', { 'index.html': '<title>Actual tuner</title>' });
    expect((await get(`${base(server)}/api/preview/document/spec`)).status).toBe(403);
    const doc = await api(server, '/api/preview/document/spec');
    expect(doc.title).toBe('Actual design');
    expect(JSON.stringify(doc.state)).toContain('Opening paragraph');
    expect(doc.contentBase).toBe(`/c/${server.contentToken}/document/spec/`);
    const board = await api(server, '/api/preview/artboard/ideas');
    expect(board.canvas.boards.a.file).toBe('pages/p/a.html');
    expect(board.layout.pages.p.bounds.maxX).toBe(640);
    expect((await api(server, '/api/preview/html/tuner')).title).toBe('Actual tuner');
    expect((await get(`${base(server)}/api/preview/html/missing`, { Cookie: cookie(server) })).status).toBe(404);
  });

  test('malformed documents return an unavailable preview without breaking the list', async () => {
    const { server, root } = await start();
    writeDocument(root, 'broken', { 'doc.xml': '<doc><script>alert(1)</script></doc>' });
    expect((await get(`${base(server)}/api/preview/document/broken`, { Cookie: cookie(server) })).status).toBe(422);
    expect((await api(server, '/api/artifacts')).artifacts[0].id).toBe('broken');
  });
});

describe('artboard API', () => {
  test('identifies the active writer and preserves an optional sticky color', async () => {
    const { server, root } = await start();
    fs.writeFileSync(stateFile(root, 'agent'), JSON.stringify({ AI_AGENT: 'codex' }));
    writeArtboard(root, 'writing', {
      ...canvas,
      notes: { n: { page: 'p', kind: 'sticky', x: 700, y: 0, text: 'Decision', color: '#cce8df' } },
    }, { 'pages/p/a.html': '<!doctype html><html><body>Drawing' });
    const payload = await api(server, '/api/artifacts/artboard/writing');
    expect(payload.warnings).toEqual([]);
    expect(payload.agent).toBe('Codex');
    expect(payload.canvas.writing).toBe('a');
    expect(payload.canvas.notes.n.color).toBe('#cce8df');
  });

  test('returns canvas, warnings, layout and the content path prefix', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
    const payload = await api(server, '/api/artifacts/artboard/b1');
    expect(payload.canvas.boards.a.w).toBe(640);
    expect(payload.warnings).toEqual([]);
    expect(payload.layout.pages.p.bounds).toEqual({ minX: 0, minY: -48, maxX: 640, maxY: 400 });
    expect(payload.contentBase).toBe(`/c/${server.contentToken}/artboard/b1/`);
  });

  test('a building artboard reports missing files as pending, not warnings', async () => {
    const { server, root } = await start();
    writeArtboard(
      root,
      'b1',
      {
        ...canvas,
        building: true,
        boards: {
          a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 },
          b: { file: 'pages/p/b.html', page: 'p', x: 680, y: 0, w: 640, h: 400 },
        },
      },
      { 'pages/p/a.html': '<p>a</p>' },
    );
    const payload = await api(server, '/api/artifacts/artboard/b1');
    expect(payload.warnings).toEqual([]);
    expect(payload.pending).toEqual(['b']);
    expect(payload.versions['pages/p/b.html']).toBe(0);
  });

  test('an empty board file is pending even without building', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '' });
    const payload = await api(server, '/api/artifacts/artboard/b1');
    expect(payload.warnings).toEqual([]);
    expect(payload.pending).toEqual(['a']);
    expect(payload.versions['pages/p/a.html']).toBe(0);
  });

  test('without agent state, a missing board is pending without a warning', async () => {
    const { server, root } = await start();
    writeArtboard(
      root,
      'b1',
      {
        ...canvas,
        boards: {
          a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 },
          b: { file: 'pages/p/b.html', page: 'p', x: 680, y: 0, w: 640, h: 400 },
        },
      },
      { 'pages/p/a.html': '<p>a</p>' },
    );
    const payload = await api(server, '/api/artifacts/artboard/b1');
    expect(payload.pending).toEqual(['b']);
    expect(payload.warnings).toEqual([]);
    expect(payload.canvas.building).toBe(true);
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

describe('document API', () => {
  test('returns the title, a version and the content path prefix', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay-sync', { 'doc.xml': '<doc><h2>Relay</h2></doc>' });
    const payload = await api(server, '/api/artifacts/document/relay-sync');
    expect(payload.title).toBe('Relay');
    expect(payload.warnings).toEqual([]);
    expect(typeof payload.version).toBe('number');
    expect(payload.contentBase).toBe(`/c/${server.contentToken}/document/relay-sync/`);
  });

  test('a missing doc.xml is a warning and the id is the title', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay-sync', { 'notes.txt': 'x' });
    const payload = await api(server, '/api/artifacts/document/relay-sync');
    expect(payload.title).toBe('relay-sync');
    expect(payload.warnings).toEqual(['doc.xml not found']);
  });

  test('only files under assets/ are served, sandboxed', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay-sync', { 'doc.xml': '<doc/>', 'comments.json': '{}', 'assets/flow.excalidraw': '{"a":1}' });
    const asset = await content(server, 'document/relay-sync/assets/flow.excalidraw');
    expect(asset.status).toBe(200);
    expect(asset.body).toBe('{"a":1}');
    expect(asset.headers['content-security-policy']).toBe("sandbox; default-src 'none'");
    expect((await content(server, 'document/relay-sync/doc.xml')).status).toBe(404);
    expect((await content(server, 'document/relay-sync/comments.json')).status).toBe(404);
  });

  test('an HTML asset is served like an HTML artifact page, with the runtimes injected', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay-sync', { 'doc.xml': '<doc/>', 'assets/tuner.html': '<ryugi-slider id="r"></ryugi-slider>' });
    const res = await content(server, 'document/relay-sync/assets/tuner.html');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toBe('sandbox allow-scripts allow-modals allow-forms allow-popups allow-downloads');
    expect(res.body).toContain('ryugi:snapshot');
    expect(res.body).toContain(`<script defer src="/c/${server.contentToken}/runtime/ryugi-ui.js"></script>`);
    expect(res.body).toContain('color-scheme:light dark');
  });
});

describe('artboard content', () => {
  test('board files are served under the content token without the session key', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
    const res = await content(server, 'artboard/b1/pages/p/a.html');
    expect(res.status).toBe(200);
    expect(res.body).toContain('<p>a</p>');
    expect(res.body).toContain('ryugi:inspect');
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toBe('sandbox allow-scripts');
  });

  test('media files answer byte ranges so Safari can play video', async () => {
    const { server, root } = await start();
    writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>', 'pages/p/flow.webm': '0123456789' });
    const whole = await content(server, 'artboard/b1/pages/p/flow.webm');
    expect(whole.status).toBe(200);
    expect(whole.headers['accept-ranges']).toBe('bytes');
    const part = await get(`${base(server)}/c/${server.contentToken}/artboard/b1/pages/p/flow.webm`, { Range: 'bytes=2-5' });
    expect(part.status).toBe(206);
    expect(part.body).toBe('2345');
    expect(part.headers['content-range']).toBe('bytes 2-5/10');
    const tail = await get(`${base(server)}/c/${server.contentToken}/artboard/b1/pages/p/flow.webm`, { Range: 'bytes=-3' });
    expect(tail.body).toBe('789');
    const beyond = await get(`${base(server)}/c/${server.contentToken}/artboard/b1/pages/p/flow.webm`, { Range: 'bytes=20-' });
    expect(beyond.status).toBe(416);
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

describe('UI runtime', () => {
  test('serves the runtime under the content token only', async () => {
    const { server } = await start();
    const ok = await get(`${base(server)}/c/${server.contentToken}/runtime/ryugi-ui.js`);
    expect(ok.status).toBe(200);
    expect(ok.body).toBe('window.__ryugiUi = true');
    expect((await get(`${base(server)}/runtime/ryugi-ui.js`)).status).not.toBe(200);
    expect((await get(`${base(server)}/c/wrong/runtime/ryugi-ui.js`)).status).toBe(404);
  });

  test('injects the runtime into HTML that uses ryugi elements, and not into plain HTML', async () => {
    const { server, root } = await start();
    writeHtml(root, 'ui', { 'index.html': '<title>UI</title><ryugi-button>Go</ryugi-button>' });
    writeHtml(root, 'plain', { 'index.html': '<title>Plain</title><p>plain</p>' });
    const injected = await content(server, 'html/ui/index.html');
    expect(injected.body).toContain(`<script defer src="/c/${server.contentToken}/runtime/ryugi-ui.js"></script>`);
    expect((await content(server, 'html/plain/index.html')).body).not.toContain('ryugi-ui.js');
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

  test('content allows the opaque-origin frame to fetch, import and load fonts from it', async () => {
    const { server, root } = await start();
    writeHtml(root, 'tuner', { 'index.html': '<p>x</p>', 'app.js': 'export const a = 1;', 'data.json': '{}' });
    for (const rel of ['index.html', 'app.js', 'data.json']) {
      expect((await content(server, `html/tuner/${rel}`)).headers['access-control-allow-origin'], rel).toBe('*');
    }
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
    expect(artboard.pending).toEqual([]);
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

  test('an agent check right after a write leaves the change message to the watcher, with the file it wrote', async () => {
    const { server, root } = await start();
    writeDocument(root, 'plan', { 'doc.xml': '<doc><p id="b1">one</p><dynamic url="assets/backoff.html"><![CDATA[{}]]></dynamic></doc>', 'assets/backoff.html': '<p>v1</p>' });
    await waitFor(() => fs.existsSync(stateFile(root, 'document', 'plan', 'warnings.json')));
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    fs.writeFileSync(path.join(root, 'document', 'plan', 'assets', 'backoff.html'), '<p>v2</p>');
    const res = await fetch(`${base(server)}/api/agent/document/plan/check?key=${server.token}`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ warnings: [] });
    await waitFor(() => ws.messages.some((m) => m.includes('"document/plan"') && m.includes('assets/backoff.html')));
    ws.socket?.destroy();
  });

  test('streams board readiness from HTML writes alone', async () => {
    const { server, root } = await start();
    const dir = writeArtboard(root, 'streaming', canvas);
    const source = fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8');
    const file = path.join(dir, 'pages/p/a.html');
    const checked = stateFile(root, 'artboard/streaming/warnings.json');
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    try {
      await waitFor(() => fs.existsSync(checked));
      expect(readJson(checked).pending).toEqual(['a']);
      const before = readJson(checked).checkedAt;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '<!doctype html><html><body>Drawing');
      await waitFor(() => readJson(checked).checkedAt !== before);
      const drawing = await api(server, '/api/artifacts/artboard/streaming');
      expect(drawing.pending).toEqual(['a']);
      expect(drawing.canvas.writing).toBe('a');
      expect(drawing.versions['pages/p/a.html']).toBe(0);

      fs.appendFileSync(file, '</body></html>');
      await waitFor(() => readJson(checked).pending.length === 0);
      const ready = await api(server, '/api/artifacts/artboard/streaming');
      expect(ready.canvas.building).toBe(false);
      expect(ready.canvas.writing).toBeUndefined();
      expect(ready.versions['pages/p/a.html']).toBeGreaterThan(0);
      expect(ws.messages.some((message) => message.includes('pages/p/a.html'))).toBe(true);
      expect(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8')).toBe(source);
    } finally {
      ws.socket?.destroy();
    }
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

describe('html runtime', () => {
  const origin = (s: ArtifactsServer) => `http://127.0.0.1:${s.port}`;
  const runtimeError = (artifact: string, message: string) => JSON.stringify({ type: 'runtime-error', artifact, message });

  test('only an html artifact\'s index.html gets the runtime script', async () => {
    const { server, root } = await start();
    writeHtml(root, 'tuner', { 'index.html': '<head></head><p>x</p>', 'other.html': '<head></head><p>y</p>' });
    writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<head></head><p>a</p>' });
    expect((await content(server, 'html/tuner/index.html')).body).toContain('ryugi:snapshot');
    expect((await content(server, 'html/tuner/other.html')).body).not.toContain('ryugi:snapshot');
    expect((await content(server, 'artboard/b1/pages/p/a.html')).body).not.toContain('ryugi:snapshot');
  });

  test('a runtime error from the viewer becomes a warning for that artifact', async () => {
    const { server, root } = await start();
    writeHtml(root, 'tuner', { 'index.html': '<p>x</p>' });
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    sendWsText(ws.socket!, runtimeError('html/tuner', 'ReferenceError: slider is not defined (index.html:12)'));
    const file = stateFile(root, 'html', 'tuner', 'warnings.json');
    await waitFor(() => fs.existsSync(file) && readJson(file).warnings.some((w: string) => w.includes('slider is not defined')));
    const payload = await api(server, '/api/artifacts/html/tuner');
    expect(payload.warnings.some((w: string) => w.startsWith('runtime: ReferenceError'))).toBe(true);
    ws.socket?.destroy();
  });

  test('oversized, malformed and unknown-artifact messages are ignored', async () => {
    const { server, root } = await start();
    writeHtml(root, 'tuner', { 'index.html': '<p>x</p>' });
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    sendWsText(ws.socket!, runtimeError('html/tuner', 'x'.repeat(3000)));
    sendWsText(ws.socket!, runtimeError('html/missing', 'boom'));
    sendWsText(ws.socket!, runtimeError('artboard/b1', 'boom'));
    sendWsText(ws.socket!, '{ not json');
    sendWsText(ws.socket!, runtimeError('html/tuner', 'marker'));
    const file = stateFile(root, 'html', 'tuner', 'warnings.json');
    await waitFor(() => fs.existsSync(file) && readJson(file).warnings.some((w: string) => w.includes('marker')));
    expect(readJson(file).warnings).toEqual(['runtime: marker']);
    expect(fs.existsSync(stateFile(root, 'html', 'missing'))).toBe(false);
    ws.socket?.destroy();
  });

  test('an error report arriving right after a rewrite does not hide that rewrite', async () => {
    const { server, root } = await start();
    const dir = writeHtml(root, 'tuner', { 'index.html': '<p>x</p>' });
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    sendWsText(ws.socket!, runtimeError('html/tuner', 'old error 1'));
    const file = stateFile(root, 'html', 'tuner', 'warnings.json');
    await waitFor(() => fs.existsSync(file) && readJson(file).warnings.length === 1);
    fs.writeFileSync(path.join(dir, 'index.html'), '<p>rewritten</p>');
    sendWsText(ws.socket!, runtimeError('html/tuner', 'old error 2'));
    await waitFor(() => ws.messages.some((m) => m.includes('"html/tuner"') && m.includes('index.html')));
    await waitFor(() => readJson(file).warnings.length === 0);
    ws.socket?.destroy();
  });

  test('warnings.json says whether the current version has run in a browser', async () => {
    const { server, root } = await start();
    const dir = writeHtml(root, 'tuner', { 'index.html': '<p>x</p>' });
    const file = stateFile(root, 'html', 'tuner', 'warnings.json');
    await waitFor(() => fs.existsSync(file));
    expect(readJson(file).ran).toBe(false);
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    const loaded = (version: number) => JSON.stringify({ type: 'loaded', artifact: 'html/tuner', version });
    sendWsText(ws.socket!, loaded(1));
    const { version } = await api(server, '/api/artifacts/html/tuner');
    sendWsText(ws.socket!, loaded(version));
    await waitFor(() => readJson(file).ran === true);
    const before = readJson(file).checkedAt;
    const later = new Date(Date.now() + 5000);
    fs.writeFileSync(path.join(dir, 'index.html'), '<p>rewritten</p>');
    fs.utimesSync(path.join(dir, 'index.html'), later, later);
    await waitFor(() => readJson(file).checkedAt !== before);
    expect(readJson(file).ran).toBe(false);
    ws.socket?.destroy();
  });

  test('a real change to the artifact clears its runtime warnings', async () => {
    const { server, root } = await start();
    const dir = writeHtml(root, 'tuner', { 'index.html': '<p>x</p>' });
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    sendWsText(ws.socket!, runtimeError('html/tuner', 'boom'));
    const file = stateFile(root, 'html', 'tuner', 'warnings.json');
    await waitFor(() => fs.existsSync(file) && readJson(file).warnings.length === 1);
    fs.writeFileSync(path.join(dir, 'index.html'), '<p>fixed</p>');
    await waitFor(() => readJson(file).warnings.length === 0);
    ws.socket?.destroy();
  });
});

describe('document dynamic blocks', () => {
  const origin = (s: ArtifactsServer) => `http://127.0.0.1:${s.port}`;
  const dynamicDoc = (url: string) => `<doc><p>intro</p><dynamic url="${url}"></dynamic></doc>`;
  const report = (type: 'runtime-error' | 'loaded', file: string, message?: string) =>
    JSON.stringify({ type, artifact: 'document/spec', file, ...(message ? { message } : {}) });

  async function setup() {
    const { server, root } = await start();
    const dir = writeDocument(root, 'spec', { 'doc.xml': dynamicDoc('assets/tuner.html'), 'assets/tuner.html': '<p>x</p>' });
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: origin(server) });
    await api(server, '/api/document/spec/state');
    return { server, root, dir, ws, file: stateFile(root, 'document', 'spec', 'warnings.json') };
  }

  test('a runtime error names its file and survives a doc.xml rewrite', async () => {
    const { dir, ws, file } = await setup();
    sendWsText(ws.socket!, report('runtime-error', 'assets/tuner.html', 'ReferenceError: r is not defined'));
    await waitFor(() => fs.existsSync(file) && readJson(file).warnings.includes('runtime: assets/tuner.html: ReferenceError: r is not defined'));
    fs.writeFileSync(path.join(dir, 'doc.xml'), dynamicDoc('assets/tuner.html').replace('intro', 'intro, edited'));
    await waitFor(() => fs.readFileSync(path.join(dir, 'doc.xml'), 'utf8').includes('id="'));
    await new Promise((r) => setTimeout(r, 100));
    expect(readJson(file).warnings).toContain('runtime: assets/tuner.html: ReferenceError: r is not defined');
    ws.socket?.destroy();
  });

  test('changing the asset clears its runtime errors and its ran flag', async () => {
    const { dir, ws, file } = await setup();
    sendWsText(ws.socket!, report('runtime-error', 'assets/tuner.html', 'boom'));
    sendWsText(ws.socket!, report('loaded', 'assets/tuner.html'));
    await waitFor(() => fs.existsSync(file) && readJson(file).dynamic?.['assets/tuner.html']?.ran === true && readJson(file).warnings.length === 1);
    fs.writeFileSync(path.join(dir, 'assets', 'tuner.html'), '<p>fixed</p>');
    await waitFor(() => readJson(file).warnings.length === 0);
    expect(readJson(file).dynamic['assets/tuner.html'].ran).toBe(false);
    ws.socket?.destroy();
  });

  test('errors for a block no longer in doc.xml are dropped', async () => {
    const { dir, ws, file } = await setup();
    sendWsText(ws.socket!, report('runtime-error', 'assets/tuner.html', 'boom'));
    await waitFor(() => fs.existsSync(file) && readJson(file).warnings.length === 1);
    fs.writeFileSync(path.join(dir, 'doc.xml'), '<doc><p>intro</p></doc>');
    await waitFor(() => readJson(file).warnings.length === 0);
    expect(readJson(file).dynamic).toEqual({});
    ws.socket?.destroy();
  });

  test('a dynamic block whose file is missing is a warning without a browser', async () => {
    const { root } = await start();
    writeDocument(root, 'spec', { 'doc.xml': dynamicDoc('assets/gone.html') });
    const file = stateFile(root, 'document', 'spec', 'warnings.json');
    await waitFor(() => fs.existsSync(file) && readJson(file).warnings.includes('assets/gone.html not found'));
  });

  test('reports for files outside assets/ are ignored', async () => {
    const { ws, file } = await setup();
    sendWsText(ws.socket!, report('runtime-error', '../doc.xml', 'boom'));
    sendWsText(ws.socket!, report('runtime-error', 'assets/tuner.html', 'marker'));
    await waitFor(() => fs.existsSync(file) && readJson(file).warnings.some((w: string) => w.includes('marker')));
    expect(readJson(file).warnings).toEqual(['runtime: assets/tuner.html: marker']);
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
