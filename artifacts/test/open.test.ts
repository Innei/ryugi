import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { openWs, readJson, waitFor, writeArtboard, writeDocument } from './helpers';

const repoRoot = path.resolve(__dirname, '../..');
const serverEntry = path.join(repoRoot, 'skills/artifacts/app/server.cjs');

const canvas = {
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
};

const running: ChildProcess[] = [];

afterEach(() => {
  for (const child of running) {
    child.kill('SIGTERM');
  }
  running.length = 0;
});

function projectRoot() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-open-project-'));
  return path.join(project, '.ryugi', 'artifacts');
}

function fakeOpenCommand() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-open-bin-'));
  const log = path.join(dir, 'opened.log');
  const bin = path.join(dir, 'open');
  fs.writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$1" >> ${JSON.stringify(log)}\n`, {
    mode: 0o755,
  });
  return { bin, log };
}

function opened(log: string) {
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [];
}

async function startServer(
  root: string,
  openCmd: string,
  openArtifact = 'artboard/header',
  env: NodeJS.ProcessEnv = {},
) {
  const child = spawn(process.execPath, [serverEntry, '--artifacts-server-id=open-test'], {
    env: {
      ...process.env,
      ...env,
      ARTIFACTS_ROOT: root,
      ARTIFACTS_HOST: '127.0.0.1',
      ARTIFACTS_URL_HOST: 'localhost',
      ARTIFACTS_OPEN_CMD: openCmd,
      ARTIFACTS_OPEN_ARTIFACT: openArtifact,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  running.push(child);
  let output = '';
  child.stdout!.on('data', (chunk) => (output += chunk));
  child.stderr!.on('data', (chunk) => (output += chunk));
  await waitFor(() => output.includes('server-started'), 5000);
  return child;
}

describe('automatic browser open', () => {
  test.skipIf(process.platform !== 'darwin').each(['found', 'missing', 'unknown'])(
    'checks for the existing artifact tab before opening a browser: %s',
    async (status) => {
      const root = projectRoot();
      writeDocument(root, 'notes', { 'doc.xml': '<doc><h1>Canvas CLI</h1></doc>' });
      const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-browser-bin-'));
      const checked = path.join(bin, 'checked');
      const opened = path.join(bin, 'opened');
      fs.writeFileSync(
        path.join(bin, 'osascript'),
        `#!/bin/sh\nprintf checked > ${JSON.stringify(checked)}\nprintf '${status}\\n'\n`,
        { mode: 0o755 },
      );
      fs.writeFileSync(
        path.join(bin, 'open'),
        `#!/bin/sh\nprintf opened > ${JSON.stringify(opened)}\n`,
        { mode: 0o755 },
      );
      await startServer(root, '', 'document/notes', { PATH: `${bin}:${process.env.PATH}` });
      await waitFor(() => fs.existsSync(checked), 5000);
      if (status === 'missing') await waitFor(() => fs.existsSync(opened), 5000);
      else await new Promise((resolve) => setTimeout(resolve, 100));
      expect(fs.existsSync(opened)).toBe(status === 'missing');
    },
    15000,
  );

  test.each([false, true])(
    'opens a newly written document with an existing library connection: %s',
    async (connected) => {
      const root = projectRoot();
      const { bin, log } = fakeOpenCommand();
      await startServer(root, bin, 'document/notes');
      const info = readJson(path.join(root, '.state/server-info'));
      const key = new URL(info.url).searchParams.get('key');
      const viewer = connected
        ? await openWs(info.port, {
            Cookie: `ryugi_artifacts_${info.port}=${key}`,
            Origin: `http://127.0.0.1:${info.port}`,
          })
        : null;
      try {
        if (viewer) expect(viewer.status).toBe(101);
        writeDocument(root, 'notes', {
          'doc.xml': '<doc><h1>Canvas CLI</h1><p>Discuss this proposal.</p></doc>',
        });
        await waitFor(() => opened(log).length > 0, 5000);
        expect(opened(log)).toHaveLength(1);
        expect(opened(log)[0]).toMatch(/\/document\/[A-Za-z0-9]{21}\?key=/);
      } finally {
        viewer?.socket?.destroy();
      }
    },
    15000,
  );

  test('closes a document session once when Ctrl+C and its forwarded termination signal arrive together', async () => {
    const root = projectRoot();
    writeDocument(root, 'notes', { 'doc.xml': '<doc><p>Keep this document</p></doc>' });
    const child = await startServer(root, '');
    let output = '';
    child.stdout!.on('data', (chunk) => {
      output += chunk;
    });
    const closed = new Promise((resolve) => child.on('close', resolve));
    child.kill('SIGINT');
    child.kill('SIGTERM');
    await closed;
    expect(output.match(/server-stopped/g)).toHaveLength(1);
    expect(fs.readFileSync(path.join(root, 'document/notes/doc.xml'), 'utf8')).toContain(
      'Keep this document',
    );
  });

  test('opens an artboard that is already ready when the server starts', async () => {
    const root = projectRoot();
    const { bin, log } = fakeOpenCommand();
    writeArtboard(root, 'header', canvas, { 'pages/p/a.html': '<p>a</p>' });

    await startServer(root, bin);

    await waitFor(() => opened(log).length > 0, 5000);
    expect(opened(log)[0]).toMatch(/\/artboard\/[A-Za-z0-9]{21}\?key=/);
  }, 15000);

  test('opens a target artboard skeleton from its declaration alone', async () => {
    const root = projectRoot();
    const { bin, log } = fakeOpenCommand();

    await startServer(root, bin);

    writeArtboard(root, 'header', canvas);
    const warningsFile = path.join(root, '.state/artboard/header/warnings.json');
    await waitFor(
      () => fs.existsSync(warningsFile) && readJson(warningsFile).pending?.length === 1,
      3000,
    );
    expect(readJson(warningsFile).warnings).toEqual([]);
    await waitFor(() => opened(log).length > 0, 5000);
    expect(opened(log)[0]).toMatch(/\/artboard\/[A-Za-z0-9]{21}\?key=/);
    expect(fs.existsSync(path.join(root, 'artboard/header/pages/p/a.html'))).toBe(false);
  }, 15000);

  test('opens a declared skeleton before any HTML and does not reopen as boards arrive', async () => {
    const root = projectRoot();
    const { bin, log } = fakeOpenCommand();
    const spec = {
      version: 1,
      pages: [{ id: 'p', name: 'P' }],
      boards: {
        a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 },
        b: { file: 'pages/p/b.html', page: 'p', x: 680, y: 0, w: 640, h: 400 },
        c: { file: 'pages/p/c.html', page: 'p', x: 1600, y: 0, w: 640, h: 400 },
      },
      groups: { q1: { boards: ['a', 'b'] }, q2: { boards: ['c'] } },
    };

    await startServer(root, bin);
    writeArtboard(root, 'header', spec);

    const warningsFile = path.join(root, '.state/artboard/header/warnings.json');
    await waitFor(
      () => fs.existsSync(warningsFile) && readJson(warningsFile).pending?.length === 3,
      3000,
    );
    expect(readJson(warningsFile).warnings).toEqual([]);
    await waitFor(() => opened(log).length > 0, 5000);
    expect(opened(log)).toHaveLength(1);
    expect(opened(log)[0]).toMatch(/\/artboard\/[A-Za-z0-9]{21}\?key=/);

    for (const [id, remaining] of [
      ['a', 2],
      ['b', 1],
      ['c', 0],
    ] as const) {
      const file = path.join(root, `artboard/header/pages/p/${id}.html`);
      expect(fs.existsSync(file)).toBe(false);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `<!doctype html><html><body>${id}</body></html>`);
      await waitFor(() => readJson(warningsFile).pending?.length === remaining, 3000);
      expect(readJson(warningsFile).warnings).toEqual([]);
      expect(opened(log)).toHaveLength(1);
    }
  }, 15000);

  test('does not open when the target is still broken', async () => {
    const root = projectRoot();
    const { bin, log } = fakeOpenCommand();

    await startServer(root, bin);
    writeArtboard(
      root,
      'header',
      {
        ...canvas,
        boards: { a: { ...canvas.boards.a, x: 0, y: 0 }, b: { ...canvas.boards.a, x: 10, y: 10 } },
      },
      { 'pages/p/a.html': '<p>a</p>' },
    );

    const warningsFile = path.join(root, '.state/artboard/header/warnings.json');
    await waitFor(
      () => fs.existsSync(warningsFile) && readJson(warningsFile).warnings.length > 0,
      3000,
    );
    expect(opened(log)).toEqual([]);
  }, 15000);
});
