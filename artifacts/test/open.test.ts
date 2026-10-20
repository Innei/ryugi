import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { readJson, waitFor, writeArtboard, writeDocument } from './helpers';

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
  fs.writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$1" >> ${JSON.stringify(log)}\n`, { mode: 0o755 });
  return { bin, log };
}

function opened(log: string) {
  return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) : [];
}

async function startServer(root: string, openCmd: string, openArtifact = 'artboard/header') {
  const child = spawn(process.execPath, [serverEntry, '--artifacts-server-id=open-test'], {
    env: {
      ...process.env,
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
  test('closes a document session once when Ctrl+C and its forwarded termination signal arrive together', async () => {
    const root = projectRoot();
    writeDocument(root, 'notes', { 'doc.xml': '<doc><p>Keep this document</p></doc>' });
    const child = await startServer(root, '');
    let output = '';
    child.stdout!.on('data', (chunk) => { output += chunk; });
    const closed = new Promise((resolve) => child.on('close', resolve));
    child.kill('SIGINT');
    child.kill('SIGTERM');
    await closed;
    expect(output.match(/server-stopped/g)).toHaveLength(1);
    expect(fs.readFileSync(path.join(root, 'document/notes/doc.xml'), 'utf8')).toContain('Keep this document');
  });

  test('opens an artboard that is already ready when the server starts', async () => {
    const root = projectRoot();
    const { bin, log } = fakeOpenCommand();
    writeArtboard(root, 'header', canvas, { 'pages/p/a.html': '<p>a</p>' });

    await startServer(root, bin);

    await waitFor(() => opened(log).length > 0, 5000);
    expect(opened(log)[0]).toMatch(/\/artboard\/header\?key=/);
  }, 15000);

  test('waits for a target artboard to be ready, then opens it', async () => {
    const root = projectRoot();
    const { bin, log } = fakeOpenCommand();

    await startServer(root, bin);

    // canvas.json arrives before its board file: the artboard is not ready yet.
    writeArtboard(root, 'header', canvas);
    const warningsFile = path.join(root, '.state/artboard/header/warnings.json');
    await waitFor(() => fs.existsSync(warningsFile) && readJson(warningsFile).warnings.length > 0, 3000);
    expect(opened(log)).toEqual([]);

    fs.mkdirSync(path.join(root, 'artboard/header/pages/p'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artboard/header/pages/p/a.html'), '<p>a</p>');

    await waitFor(() => opened(log).length > 0, 5000);
    expect(opened(log)[0]).toMatch(/\/artboard\/header\?key=/);
  }, 15000);

  test('opens after the first group is complete, not on the first board', async () => {
    const root = projectRoot();
    const { bin, log } = fakeOpenCommand();
    const spec = {
      version: 1,
      building: true,
      pages: [{ id: 'p', name: 'P' }],
      boards: {
        a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 },
        b: { file: 'pages/p/b.html', page: 'p', x: 680, y: 0, w: 640, h: 400 },
        c: { file: 'pages/p/c.html', page: 'p', x: 1600, y: 0, w: 640, h: 400 },
      },
      groups: { q1: { boards: ['a', 'b'] }, q2: { boards: ['c'] } },
    };

    await startServer(root, bin);
    writeArtboard(root, 'header', spec, { 'pages/p/a.html': '<p>a</p>' });

    const warningsFile = path.join(root, '.state/artboard/header/warnings.json');
    await waitFor(() => fs.existsSync(warningsFile) && readJson(warningsFile).pending?.length === 2, 3000);
    expect(readJson(warningsFile).warnings).toEqual([]);
    expect(opened(log)).toEqual([]);

    fs.writeFileSync(path.join(root, 'artboard/header/pages/p/b.html'), '<p>b</p>');
    await waitFor(() => opened(log).length > 0, 5000);
    expect(opened(log)[0]).toMatch(/\/artboard\/header\?key=/);
  }, 15000);

  test('does not open when the target is still broken', async () => {
    const root = projectRoot();
    const { bin, log } = fakeOpenCommand();

    await startServer(root, bin);
    writeArtboard(root, 'header', {
      ...canvas,
      boards: { a: { ...canvas.boards.a, x: 0, y: 0 }, b: { ...canvas.boards.a, x: 10, y: 10 } },
    }, { 'pages/p/a.html': '<p>a</p>' });

    const warningsFile = path.join(root, '.state/artboard/header/warnings.json');
    await waitFor(() => fs.existsSync(warningsFile) && readJson(warningsFile).warnings.length > 0, 3000);
    expect(opened(log)).toEqual([]);
  }, 15000);
});
