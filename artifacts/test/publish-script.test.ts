import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { listen } from '../src/server/http';
import { writeHtml } from './helpers';

const scriptsDir = path.resolve(__dirname, '../../skills/artifacts/app');
const start = path.join(scriptsDir, 'start-server.sh');
const stop = path.join(scriptsDir, 'stop-server.sh');
const publish = path.join(scriptsDir, 'publish.sh');

interface Seen {
  method: string;
  path: string;
  visibility?: string;
}

let cloud: http.Server;
let cloudOrigin = '';
let seen: Seen[] = [];
let projects: string[] = [];
let configHome = '';

beforeEach(async () => {
  seen = [];
  configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-xdg-'));
  cloud = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const entry: Seen = { method: req.method ?? '', path: req.url ?? '' };
    const type = req.headers['content-type'] ?? '';
    if (type.startsWith('multipart/form-data')) {
      const form = await new Response(body, { headers: { 'content-type': type } }).formData();
      entry.visibility = JSON.parse(String(form.get('meta'))).visibility;
    } else if (body.length > 0) {
      entry.visibility = JSON.parse(body.toString()).visibility;
    }
    seen.push(entry);
    res.writeHead(entry.method === 'DELETE' ? 204 : 200, { 'Content-Type': 'application/json' });
    if (entry.method === 'GET') res.end(JSON.stringify({ artifacts: [{ id: 'c1' }] }));
    else if (entry.method === 'DELETE') res.end();
    else res.end(JSON.stringify({ id: 'c1', url: `${cloudOrigin}/a/c1`, visibility: entry.visibility, updatedAt: '2026-10-20T08:00:00.000Z' }));
  });
  cloudOrigin = `http://127.0.0.1:${await listen(cloud, '127.0.0.1', 0)}`;
});

afterEach(async () => {
  for (const project of projects) spawnSync('bash', [stop, project], { encoding: 'utf8', timeout: 15000 });
  projects = [];
  await new Promise<void>((resolve) => cloud.close(() => resolve()));
});

const env = () => ({ ...process.env, ARTIFACTS_OPEN: '0', XDG_CONFIG_HOME: configHome, RYUGI_CLOUD_ORIGIN: cloudOrigin });

function run(script: string, args: string[]): Promise<{ code: number | null; out: Record<string, any> }> {
  return new Promise((resolve) => {
    const child = spawn('bash', [script, ...args], { env: env() });
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('close', (code) => resolve({ code, out: JSON.parse(stdout.trim().split('\n').pop()!) }));
  });
}

async function project({ running = true, signedIn = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-project-'));
  projects.push(dir);
  writeHtml(path.join(dir, '.ryugi', 'artifacts'), 'arrow', { 'index.html': '<title>Arrow</title>' });
  if (signedIn) {
    fs.mkdirSync(path.join(configHome, 'ryugi'), { recursive: true });
    fs.writeFileSync(path.join(configHome, 'ryugi', 'credentials.json'), JSON.stringify({ origin: cloudOrigin, token: 't', login: 'innei' }));
  }
  if (running) expect((await run(start, ['--project-dir', dir, '--background'])).out.type).toBe('server-started');
  return dir;
}

describe('publish.sh', () => {
  test('asks for the server to be started when none is running', async () => {
    const dir = await project({ running: false });
    const { code, out } = await run(publish, ['--project-dir', dir, '--artifact', 'html/arrow']);
    expect(code).toBe(1);
    expect(out.error).toContain('start-server.sh');
  });

  test('publishes an artifact and prints its link', async () => {
    const dir = await project();
    const { code, out } = await run(publish, ['--project-dir', dir, '--artifact', 'html/arrow']);
    expect(code).toBe(0);
    expect(out).toMatchObject({ type: 'published', artifact: 'html/arrow', url: `${cloudOrigin}/a/c1`, visibility: 'private' });
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual(['POST /api/artifacts']);
  });

  test('--public sets the visibility before publishing', async () => {
    const dir = await project();
    const { out } = await run(publish, ['--project-dir', dir, '--artifact', 'html/arrow', '--public']);
    expect(out.visibility).toBe('public');
    expect(seen.at(-1)!.visibility).toBe('public');
  });

  test('prints a sign-in link and exits 2 when not signed in', async () => {
    const dir = await project({ signedIn: false });
    const { code, out } = await run(publish, ['--project-dir', dir, '--artifact', 'html/arrow']);
    expect(code).toBe(2);
    expect(out.type).toBe('login-required');
    expect(out.url).toContain(`${cloudOrigin}/auth/cli?port=`);
  });

  test('reports why an artifact cannot be published', async () => {
    const dir = await project();
    fs.rmSync(path.join(dir, '.ryugi', 'artifacts', 'html', 'arrow', 'index.html'));
    const { code, out } = await run(publish, ['--project-dir', dir, '--artifact', 'html/arrow']);
    expect(code).toBe(1);
    expect(out.reasons).toEqual(['index.html not found']);
  });

  test('--unpublish removes the cloud copy', async () => {
    const dir = await project();
    await run(publish, ['--project-dir', dir, '--artifact', 'html/arrow']);
    const { out } = await run(publish, ['--project-dir', dir, '--artifact', 'html/arrow', '--unpublish']);
    expect(out).toMatchObject({ type: 'unpublished', artifact: 'html/arrow' });
    expect(seen.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/artifacts/c1' });
  });

  test('--list and --delete manage cloud copies by id', async () => {
    const dir = await project();
    expect((await run(publish, ['--project-dir', dir, '--list'])).out).toEqual({ type: 'cloud-artifacts', artifacts: [{ id: 'c1' }] });
    expect((await run(publish, ['--project-dir', dir, '--delete', 'c1'])).out).toEqual({ type: 'deleted', id: 'c1' });
    expect(seen.at(-1)).toMatchObject({ method: 'DELETE', path: '/api/artifacts/c1' });
  });

  test('rejects a malformed artifact name', async () => {
    const dir = await project({ running: false });
    const { code, out } = await run(publish, ['--project-dir', dir, '--artifact', 'html/Bad Name']);
    expect(code).toBe(1);
    expect(out.error).toContain('<type>/<id>');
  });
});
