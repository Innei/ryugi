import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { AGENT_MARKERS } from '../src/server/agent';
import { writeArtboard, writeDocument, writeHtml } from './helpers';

const cli = path.resolve(__dirname, '../../skills/artifacts/app/cli.cjs');
let projects: string[] = [];

afterEach(() => {
  for (const project of projects)
    spawnSync(process.execPath, [cli, 'stop', '--project-dir', project], {
      encoding: 'utf8',
      timeout: 15000,
    });
  projects = [];
});

function run(args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, ARTIFACTS_OPEN: '0' };
  for (const key of AGENT_MARKERS) delete env[key];
  return new Promise<{ code: number | null; out: Record<string, any> }>((resolve) => {
    const child = spawn(process.execPath, [cli, ...args, '--json'], { env });
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('close', (code) => {
      let out: Record<string, any> = {};
      try {
        out = JSON.parse(stdout.trim().split('\n').pop() ?? '');
      } catch {}
      resolve({ code, out });
    });
    child.stdin.end();
  });
}

const canvas = (boards: Record<string, string>) => ({
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: Object.fromEntries(
    Object.entries(boards).map(([id, file], index) => [
      id,
      { file, page: 'p', x: index * 720, y: 0, w: 640, h: 400 },
    ]),
  ),
});

async function project(write: (root: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-project-'));
  projects.push(dir);
  write(path.join(dir, '.ryugi', 'artifacts'));
  expect((await run(['start', '--project-dir', dir, '--background'])).out.type).toBe(
    'server-started',
  );
  return dir;
}

describe('ryugi-artifacts check', () => {
  test('waits for the check after the newest write and prints it', async () => {
    const dir = await project((root) =>
      writeArtboard(root, 'nav', canvas({ a: 'pages/p/a.html' }), {
        'pages/p/a.html': '<html><body>a</body></html>',
      }),
    );
    const board = path.join(dir, '.ryugi', 'artifacts', 'artboard', 'nav');
    fs.writeFileSync(
      path.join(board, 'canvas.json'),
      JSON.stringify(canvas({ a: 'pages/p/a.html', b: 'pages/p/b.html' })),
    );
    const written = fs.statSync(path.join(board, 'canvas.json')).mtimeMs;
    const { code, out } = await run(['check', '--project-dir', dir, '--artifact', 'artboard/nav']);
    expect(code).toBe(0);
    expect(out).toMatchObject({
      type: 'checked',
      artifact: 'artboard/nav',
      warnings: [],
      pending: ['b'],
    });
    expect(Date.parse(out.checkedAt)).toBeGreaterThanOrEqual(Math.floor(written));
  });

  test('reports whether an html page has run in a browser', async () => {
    const dir = await project((root) =>
      writeHtml(root, 'tuner', { 'index.html': '<html><body>t</body></html>' }),
    );
    const { code, out } = await run(['check', '--project-dir', dir, '--artifact', 'html/tuner']);
    expect(code).toBe(0);
    expect(out).toMatchObject({
      type: 'checked',
      artifact: 'html/tuner',
      warnings: [],
      ran: false,
    });
  });

  test('waits for the document merge before reporting its warnings', async () => {
    const dir = await project((root) =>
      writeDocument(root, 'plan', { 'doc.xml': '<doc><p id="b1">one</p></doc>' }),
    );
    fs.writeFileSync(
      path.join(dir, '.ryugi', 'artifacts', 'document', 'plan', 'doc.xml'),
      '<doc><p id="b1">one</p><codeblock id="c1" lang="text"><![CDATA[┌───┐    ┌───┐\n│ a │ ─> │ b │\n└───┘    └───┘]]></codeblock></doc>',
    );
    const { code, out } = await run(['check', '--project-dir', dir, '--artifact', 'document/plan']);
    expect(code).toBe(0);
    expect(out.type).toBe('checked');
    expect(out.warnings.join('\n')).toMatch(/box-drawing/);
  });

  test('sees a deleted file at once', async () => {
    const dir = await project((root) =>
      writeHtml(root, 'tuner', { 'index.html': '<html><body>t</body></html>' }),
    );
    fs.rmSync(path.join(dir, '.ryugi', 'artifacts', 'html', 'tuner', 'index.html'));
    const { out } = await run(['check', '--project-dir', dir, '--artifact', 'html/tuner']);
    expect(out.warnings.join('\n')).toMatch(/index\.html/);
  });

  test('sees a renamed file', async () => {
    const dir = await project((root) =>
      writeHtml(root, 'tuner', { 'draft.html': '<html><body>t</body></html>' }),
    );
    const html = path.join(dir, '.ryugi', 'artifacts', 'html', 'tuner');
    expect(
      (await run(['check', '--project-dir', dir, '--artifact', 'html/tuner'])).out.warnings.join(
        '\n',
      ),
    ).toMatch(/index\.html/);
    fs.renameSync(path.join(html, 'draft.html'), path.join(html, 'index.html'));
    const { out } = await run(['check', '--project-dir', dir, '--artifact', 'html/tuner']);
    expect(out.warnings).toEqual([]);
  });

  test('fails when no server is running', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-project-'));
    projects.push(dir);
    writeHtml(path.join(dir, '.ryugi', 'artifacts'), 'tuner', { 'index.html': '<html></html>' });
    const { code, out } = await run(['check', '--project-dir', dir, '--artifact', 'html/tuner']);
    expect(code).toBe(1);
    expect(out.error).toMatch(/No artifacts server is running/);
  });

  test('fails for an artifact that does not exist', async () => {
    const dir = await project((root) =>
      writeHtml(root, 'tuner', { 'index.html': '<html></html>' }),
    );
    const { code, out } = await run(['check', '--project-dir', dir, '--artifact', 'html/missing']);
    expect(code).toBe(1);
    expect(out.error).toMatch(/html\/missing/);
  });
});
