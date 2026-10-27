import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { parseDocument } from '../src/server/document-codec';
import { listen } from '../src/server/http';

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

const DOC = '<doc><h1 id="t1">Sync design</h1><p id="b1">Events carry a seq.</p></doc>';

const comments = {
  version: 1,
  threads: [
    { id: 'th1', anchor: { blockId: 'b1', quote: 'carry a seq' }, status: 'open', statusAt: '2026-10-27T08:00:00.000Z', messages: [{ id: 'm1', author: 'human', name: 'Innei', text: 'Why seq and not a timestamp?', at: '2026-10-27T08:00:00.000Z' }] },
    { id: 'th2', anchor: { blockId: 't1', quote: 'Sync' }, status: 'resolved', statusAt: '2026-10-27T09:00:00.000Z', messages: [{ id: 'm2', author: 'agent', text: 'Renamed.', at: '2026-10-27T09:00:00.000Z' }] },
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
  cloud = http.createServer((req, res) => {
    const entry = { path: req.url ?? '', auth: req.headers.authorization };
    seen.push(entry);
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
  fs.writeFileSync(path.join(configHome, 'ryugi', 'credentials.json'), JSON.stringify({ origin: credentialsOrigin, token: 'tok', login: 'innei' }));
}

function run(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'get', ...args], { env: { ...process.env, XDG_CONFIG_HOME: configHome, RYUGI_CLOUD_ORIGIN: origin } });
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
    expect(out).toMatchObject({ type: 'artifact', artifactType: 'document', id: 'abc123', title: 'Sync design', visibility: 'private', updatedAt: '2026-10-27T10:00:00.000Z' });
    expect(out.content).toContain('Events carry a seq.');
    expect(out.comments.map((t: { id: string }) => t.id)).toEqual(['th1', 'th2']);
  });

  test('not signed in and not found asks for a sign-in on stderr with exit 2', async () => {
    reply = () => ({ status: 404, body: { error: 'artifact not found', code: 'artifact_not_found' } });
    const { code, stdout, stderr } = await run([`${origin}/a/abc123`]);
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain('ryugi-artifacts publish --login');
  });

  test('signed in and not found says so', async () => {
    signIn();
    reply = () => ({ status: 404, body: { error: 'artifact not found', code: 'artifact_not_found' } });
    const { code, stderr } = await run([`${origin}/a/abc123`]);
    expect(code).toBe(1);
    expect(stderr).toContain('not found or no access');
  });

  test('passes a rate limit through, in the JSON shape with --json', async () => {
    reply = () => ({ status: 429, body: { error: 'Too many views from this network; try again tomorrow.', code: 'view_rate_limited' } });
    const plain = await run([`${origin}/a/abc123`]);
    expect(plain.code).toBe(1);
    expect(plain.stderr).toContain('Too many views from this network');
    const json = await run([`${origin}/a/abc123`, '--json']);
    expect(json.code).toBe(1);
    expect(JSON.parse(json.stdout.trim())).toMatchObject({ error: 'Too many views from this network; try again tomorrow.', code: 'view_rate_limited', status: 429 });
  });

  test('an unpublished artifact is an error', async () => {
    signIn();
    reply = () => ({ status: 200, body: { type: 'document', title: null, published: false, payload: null } });
    const { code, stderr } = await run([`${origin}/a/abc123`]);
    expect(code).toBe(1);
    expect(stderr).toContain('not published yet');
  });

  test('rejects something that is not a link or id', async () => {
    const { code, stderr } = await run(['https://example.com/x/y z']);
    expect(code).toBe(1);
    expect(stderr).toContain('Ryugi Cloud link');
    expect(seen).toEqual([]);
  });
});
