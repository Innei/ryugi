import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { parseDocument } from '../src/server/document-codec';
import { listen } from '../src/server/http';
import { injectRuntime } from '../src/server/inject';
import { CLOUD_RUNTIME_URL } from '../src/server/publish-payload';

const cli = path.resolve(__dirname, '../../skills/artifacts/app/cli.cjs');

interface Seen {
  path: string;
  auth: string | undefined;
}

let cloud: http.Server;
let origin = '';
let seen: Seen[] = [];
let reply: (req: Seen) => { status: number; body: unknown };
let configHome = '';
let cacheHome = '';
let content: Record<string, string> = {};

const DOC = '<doc><h1 id="t1">Sync design</h1><p id="b1">Events carry a seq.</p></doc>';

const comments = {
  version: 1,
  threads: [
    {
      id: 'th1',
      anchor: { blockId: 'b1', quote: 'carry a seq' },
      status: 'open',
      statusAt: '2026-10-27T08:00:00.000Z',
      messages: [
        {
          id: 'm1',
          author: 'human',
          name: 'Innei',
          text: 'Why seq and not a timestamp?',
          at: '2026-10-27T08:00:00.000Z',
        },
      ],
    },
    {
      id: 'th2',
      anchor: { blockId: 't1', quote: 'Sync' },
      status: 'resolved',
      statusAt: '2026-10-27T09:00:00.000Z',
      messages: [{ id: 'm2', author: 'agent', text: 'Renamed.', at: '2026-10-27T09:00:00.000Z' }],
    },
  ],
};

const published = (overrides: Record<string, unknown> = {}) => ({
  status: 200,
  body: {
    type: 'document',
    title: 'Sync design',
    updatedAt: '2026-10-27T10:00:00.000Z',
    visibility: 'private',
    owner: true,
    published: true,
    contentBase: `${origin}/content/`,
    liveContentBase: null,
    payload: { title: 'Sync design', state: parseDocument(DOC), comments },
    files: ['doc.xml'],
    ...overrides,
  },
});

beforeEach(async () => {
  seen = [];
  reply = () => published();
  configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-get-config-'));
  cacheHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-get-cache-'));
  content = {};
  cloud = http.createServer((req, res) => {
    const entry = { path: req.url ?? '', auth: req.headers.authorization };
    seen.push(entry);
    if (entry.path.startsWith('/content/')) {
      const file = content[decodeURIComponent(entry.path.slice('/content/'.length))];
      res.writeHead(file === undefined ? 404 : 200);
      res.end(file ?? '');
      return;
    }
    const { status, body } = reply(entry);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  origin = `http://127.0.0.1:${await listen(cloud, '127.0.0.1', 0)}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => cloud.close(() => resolve()));
});

function signIn(credentialsOrigin = origin) {
  fs.mkdirSync(path.join(configHome, 'ryugi'), { recursive: true });
  fs.writeFileSync(
    path.join(configHome, 'ryugi', 'credentials.json'),
    JSON.stringify({ origin: credentialsOrigin, token: 'tok', login: 'innei' }),
  );
}

function run(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'get', ...args], {
      env: {
        ...process.env,
        XDG_CONFIG_HOME: configHome,
        XDG_CACHE_HOME: cacheHome,
        RYUGI_CLOUD_ORIGIN: origin,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('ryugi-artifacts get', () => {
  test('prints a document as LiteXML followed by its comments, even without a terminal', async () => {
    signIn();
    const { code, stdout } = await run([`${origin}/a/abc123`]);
    expect(code).toBe(0);
    expect(seen).toEqual([{ path: '/api/a/abc123', auth: 'Bearer tok' }]);
    expect(stdout.startsWith('<doc>')).toBe(true);
    expect(stdout).toContain('id="b1"');
    expect(stdout).toContain('Events carry a seq.');
    const tail = stdout.slice(stdout.indexOf('</doc>'));
    expect(tail).toContain('[b1] "carry a seq"');
    expect(tail).toContain('Innei: Why seq and not a timestamp?');
    expect(tail).toContain('[t1] "Sync" (resolved)');
    expect(tail).toContain('agent: Renamed.');
  });

  test('accepts the view link and a bare id', async () => {
    signIn();
    await run([`${origin}/a/abc123/view`]);
    await run(['abc123']);
    expect(seen.map((s) => s.path)).toEqual(['/api/a/abc123', '/api/a/abc123']);
  });

  test('never sends a token saved for another origin', async () => {
    signIn('https://ryugi.innei.dev');
    reply = () => published({ owner: false, visibility: 'public' });
    const { code } = await run([`${origin}/a/abc123`]);
    expect(code).toBe(0);
    expect(seen[0]!.auth).toBeUndefined();
  });

  test('--no-comments leaves the comments out', async () => {
    signIn();
    const { stdout } = await run([`${origin}/a/abc123`, '--no-comments']);
    expect(stdout.trim().endsWith('</doc>')).toBe(true);
    expect(stdout).not.toContain('carry a seq"');
  });

  test('--json prints one artifact line', async () => {
    signIn();
    const { code, stdout } = await run([`${origin}/a/abc123`, '--json']);
    expect(code).toBe(0);
    const out = JSON.parse(stdout.trim());
    expect(out).toMatchObject({
      type: 'artifact',
      artifactType: 'document',
      id: 'abc123',
      title: 'Sync design',
      visibility: 'private',
      updatedAt: '2026-10-27T10:00:00.000Z',
    });
    expect(out.content).toContain('Events carry a seq.');
    expect(out.comments.map((t: { id: string }) => t.id)).toEqual(['th1', 'th2']);
    expect(out).not.toHaveProperty('dir');
  });

  test('not signed in and not found asks for a sign-in on stderr with exit 2', async () => {
    reply = () => ({
      status: 404,
      body: { error: 'artifact not found', code: 'artifact_not_found' },
    });
    const { code, stdout, stderr } = await run([`${origin}/a/abc123`]);
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('ryugi-artifacts publish --login');
  });

  test('signed in and not found says so', async () => {
    signIn();
    reply = () => ({
      status: 404,
      body: { error: 'artifact not found', code: 'artifact_not_found' },
    });
    const { code, stderr } = await run([`${origin}/a/abc123`]);
    expect(code).toBe(1);
    expect(stderr).toContain('not found or no access');
  });

  test('passes a rate limit through, in the JSON shape with --json', async () => {
    reply = () => ({
      status: 429,
      body: {
        error: 'Too many views from this network; try again tomorrow.',
        code: 'view_rate_limited',
      },
    });
    const plain = await run([`${origin}/a/abc123`]);
    expect(plain.code).toBe(1);
    expect(plain.stderr).toContain('Too many views from this network');
    const json = await run([`${origin}/a/abc123`, '--json']);
    expect(json.code).toBe(1);
    expect(JSON.parse(json.stdout.trim())).toMatchObject({
      error: 'Too many views from this network; try again tomorrow.',
      code: 'view_rate_limited',
      status: 429,
    });
  });

  test('an unpublished artifact is an error', async () => {
    signIn();
    reply = () => ({
      status: 200,
      body: { type: 'document', title: null, published: false, payload: null },
    });
    const { code, stderr } = await run([`${origin}/a/abc123`]);
    expect(code).toBe(1);
    expect(stderr).toContain('not published yet');
  });

  test('downloads an html artifact into --out and lists its files', async () => {
    signIn();
    content = { 'index.html': '<title>Arrow</title>', 'css/style.css': 'a{}' };
    reply = () =>
      published({
        type: 'html',
        title: 'Arrow',
        payload: { title: 'Arrow' },
        files: ['css/style.css', 'index.html'],
      });
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-get-out-'));
    const { code, stdout } = await run([`${origin}/a/abc123`, '--out', out]);
    expect(code).toBe(0);
    expect(fs.readFileSync(path.join(out, 'index.html'), 'utf8')).toBe('<title>Arrow</title>');
    expect(fs.readFileSync(path.join(out, 'css/style.css'), 'utf8')).toBe('a{}');
    expect(stdout.split('\n').filter(Boolean)).toEqual([out, 'css/style.css', 'index.html']);
  });

  test('without --out an artifact goes to a fresh cache directory', async () => {
    content = { 'index.html': '<title>Arrow</title>' };
    reply = () =>
      published({
        type: 'html',
        owner: false,
        visibility: 'public',
        payload: { title: 'Arrow' },
        files: ['index.html'],
      });
    const dir = path.join(cacheHome, 'ryugi', 'get', 'abc123');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'stale.html'), 'old');
    const { code, stdout } = await run([`${origin}/a/abc123`, '--json']);
    expect(code).toBe(0);
    expect(JSON.parse(stdout.trim())).toMatchObject({
      type: 'artifact',
      artifactType: 'html',
      dir,
      files: ['index.html'],
    });
    expect(fs.readdirSync(dir)).toEqual(['index.html']);
  });

  test('an artboard also gets its canvas.json', async () => {
    signIn();
    content = { 'pages/main/a.html': '<p>A</p>' };
    const canvas = { version: 1, title: 'Board', boards: { a: { file: 'pages/main/a.html' } } };
    reply = () =>
      published({
        type: 'artboard',
        payload: { canvas, layout: {}, versions: {}, snapshots: true },
        files: ['pages/main/a.html'],
      });
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-get-out-'));
    const { code, stdout } = await run([`${origin}/a/abc123`, '--out', out, '--json']);
    expect(code).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(out, 'canvas.json'), 'utf8'))).toEqual(canvas);
    expect(JSON.parse(stdout.trim()).files).toEqual(['canvas.json', 'pages/main/a.html']);
  });

  test('a published artboard lists its own canvas.json once and keeps that file', async () => {
    signIn();
    const published_canvas = '{"version":1,"title":"Board","boards":{}}\n';
    content = { 'canvas.json': published_canvas, 'pages/main/a.html': '<p>A</p>' };
    reply = () =>
      published({
        type: 'artboard',
        payload: { canvas: { version: 1 }, layout: {}, versions: {}, snapshots: true },
        files: ['canvas.json', 'pages/main/a.html'],
      });
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-get-out-'));
    const { code, stdout } = await run([`${origin}/a/abc123`, '--out', out]);
    expect(code).toBe(0);
    expect(stdout.split('\n').filter(Boolean)).toEqual([out, 'canvas.json', 'pages/main/a.html']);
    expect(fs.readFileSync(path.join(out, 'canvas.json'), 'utf8')).toBe(published_canvas);
  });

  test('downloaded pages come back without the runtime Ryugi injected when publishing', async () => {
    signIn();
    const authored =
      '<!doctype html><html><head><title>A</title></head><body><p>A</p></body></html>';
    content = {
      'canvas.json': '{}',
      'pages/main/a.html': injectRuntime(authored, {
        uiRuntimeUrl: CLOUD_RUNTIME_URL,
        inspector: true,
      }),
    };
    reply = () =>
      published({
        type: 'artboard',
        payload: { canvas: {}, layout: {}, versions: {}, snapshots: true },
        files: ['canvas.json', 'pages/main/a.html'],
      });
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-get-out-'));
    expect((await run([`${origin}/a/abc123`, '--out', out])).code).toBe(0);
    expect(fs.readFileSync(path.join(out, 'pages/main/a.html'), 'utf8')).toBe(authored);
  });

  test('an unexpected failure is one plain line on stderr, not JSON on stdout', async () => {
    signIn();
    content = { 'index.html': 'ok' };
    reply = () => published({ type: 'html', payload: { title: 'Arrow' }, files: ['index.html'] });
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-get-out-')), 'plain-file');
    fs.writeFileSync(file, '');
    const { code, stdout, stderr } = await run([
      `${origin}/a/abc123`,
      '--out',
      path.join(file, 'x'),
    ]);
    expect(code).toBe(1);
    expect(stdout).toBe('');
    expect(stderr.trim().split('\n')).toHaveLength(1);
    expect(stderr).toMatch(/^Error: .*ENOTDIR/);
  });

  test('refuses a file path that leaves the directory and writes nothing', async () => {
    signIn();
    content = { 'index.html': 'ok' };
    reply = () =>
      published({
        type: 'html',
        payload: { title: 'Arrow' },
        files: ['index.html', '../evil.html'],
      });
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-get-out-'));
    const out = path.join(parent, 'inner');
    const { code, stderr } = await run([`${origin}/a/abc123`, '--out', out]);
    expect(code).toBe(1);
    expect(stderr).toContain('../evil.html');
    expect(fs.existsSync(path.join(parent, 'evil.html'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'index.html'))).toBe(false);
  });

  test('a document that references files downloads them and names the directory first', async () => {
    signIn();
    content = { 'assets/flow.png': 'png-bytes' };
    reply = () => published({ files: ['assets/flow.png', 'doc.xml'] });
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-get-out-'));
    const { code, stdout } = await run([`${origin}/a/abc123`, '--out', out]);
    expect(code).toBe(0);
    expect(stdout.split('\n')[0]).toBe(`Files: ${out}`);
    expect(stdout.split('\n')[1]!.startsWith('<doc>')).toBe(true);
    expect(fs.readFileSync(path.join(out, 'assets/flow.png'), 'utf8')).toBe('png-bytes');
    expect(fs.existsSync(path.join(out, 'doc.xml'))).toBe(false);
  });

  test('rejects something that is not a link or id', async () => {
    const { code, stderr } = await run(['https://example.com/x/y z']);
    expect(code).toBe(1);
    expect(stderr).toContain('Ryugi Cloud link');
    expect(seen).toEqual([]);
  });
});
