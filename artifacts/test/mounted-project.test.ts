import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { mountArtifactsProject } from '../src/server/app';
import { listen } from '../src/server/http';
import { get, tempRoot, waitFor, writeArtboard } from './helpers';

const canvas = {
  version: 1,
  title: 'Mounted board',
  pages: [{ id: 'p', name: 'P' }],
  boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
};

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn();
});

async function mounted() {
  const temp = tempRoot();
  const front = http.createServer();
  const board = http.createServer();
  const port = await listen(front, '127.0.0.1', 0);
  const boardPort = await listen(board, '127.0.0.1', 0);
  const project = await mountArtifactsProject({
    root: temp.root,
    viewerDir: temp.viewer,
    runtimeDir: temp.runtime,
    host: '127.0.0.1',
    urlHost: 'localhost',
    mount: { port, boardPort, token: 'k'.repeat(48), version: '9.9.9' },
  });
  front.on('request', (req, res) => project.handleRequest(req, res));
  front.on('upgrade', (req, socket, head) => project.handleUpgrade(req, socket, head));
  board.on('request', (req, res) => project.handleBoardRequest(req, res));
  cleanup.push(async () => {
    await project.close();
    front.closeAllConnections();
    board.closeAllConnections();
    await new Promise((resolve) => front.close(resolve));
    await new Promise((resolve) => board.close(resolve));
  });
  return { project, port, boardPort, root: temp.root };
}

const addressOf = (dir: string) => fs.readFileSync(path.join(dir, '.artifact-id'), 'utf8').trim();

test('a mounted project serves its pages through a server it does not own', async () => {
  const { project, port, root } = await mounted();
  const dir = writeArtboard(root, 'flow', canvas, { 'pages/p/a.html': '<p>a</p></html>' });
  const link = project.linkFor('artboard', 'flow');
  expect(link.startsWith(`http://localhost:${port}/artboard/`)).toBe(true);
  const page = await get(link.replace('localhost', '127.0.0.1'));
  expect(page.status).toBe(200);
  expect(addressOf(dir)).toBe(link.split('/').pop());
});

test('a mounted project answers agent checks', async () => {
  const { port, root } = await mounted();
  writeArtboard(root, 'flow', canvas, { 'pages/p/a.html': '<p>a</p></html>' });
  const res = await fetch(`http://127.0.0.1:${port}/api/agent/artboard/flow/check`, {
    method: 'POST',
  });
  expect(res.status).toBe(200);
  expect(((await res.json()) as { warnings: string[] }).warnings).toEqual([]);
});

test('a mounted project serves boards on the board port it was given', async () => {
  const { project, boardPort, root } = await mounted();
  const dir = writeArtboard(root, 'flow', canvas, { 'pages/p/a.html': '<p>board</p></html>' });
  project.linkFor('artboard', 'flow');
  const res = await get(
    `http://127.0.0.1:${boardPort}/c/artboard/${addressOf(dir)}/pages/p/a.html`,
  );
  expect(res.status).toBe(200);
  expect(res.body).toContain('board');
});

test('a mounted project resolves its artifacts by slug or address', async () => {
  const { project, root } = await mounted();
  const dir = writeArtboard(root, 'flow', canvas);
  project.linkFor('artboard', 'flow');
  expect(project.resolve('artboard', 'flow')).toBe('flow');
  expect(project.resolve('artboard', addressOf(dir))).toBe('flow');
  expect(project.resolve('artboard', 'nope')).toBeNull();
});

test('a mounted project hands change events to the relay tap instead of its own relay', async () => {
  const { project, root } = await mounted();
  writeArtboard(root, 'flow', canvas, { 'pages/p/a.html': '<p>a</p></html>' });
  const events: string[] = [];
  project.onRelayEvent((key) => events.push(key));
  await new Promise((resolve) => setTimeout(resolve, 300));
  fs.writeFileSync(path.join(root, 'artboard', 'flow', 'pages', 'p', 'a.html'), '<p>b</p></html>');
  await waitFor(() => events.includes('artboard/flow'));
});

test('a mounted project writes a server-info that points at the shared port and removes it on close', async () => {
  const { project, port, root } = await mounted();
  const info = JSON.parse(fs.readFileSync(path.join(root, '.state', 'server-info'), 'utf8'));
  expect(info.port).toBe(port);
  expect(info.url).toBe(`http://localhost:${port}/`);
  await project.close();
  expect(fs.existsSync(path.join(root, '.state', 'server-info'))).toBe(false);
});
