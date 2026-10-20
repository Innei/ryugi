import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { startArtifactsServer, type ArtifactsServer } from '../src/server/app';
import { openWs, readJson, sendWsText, tempRoot, waitFor, writeArtboard } from './helpers';

const canvas = {
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
};

let running: ArtifactsServer[] = [];
afterEach(async () => {
  await Promise.all(running.map((s) => s.close()));
  running = [];
});

async function start(root = tempRoot().root) {
  const temp = tempRoot();
  const server = await startArtifactsServer({ root, viewerDir: temp.viewer, runtimeDir: temp.runtime, host: '127.0.0.1', urlHost: 'localhost' });
  running.push(server);
  return { server, root };
}
const connect = (server: ArtifactsServer) => openWs(server.port, { Cookie: `ryugi_artifacts_${server.port}=${server.token}`, Origin: `http://127.0.0.1:${server.port}` });
const node = (n: number) => ({ id: `a#${n}`, board: 'a', file: 'pages/p/a.html', tag: 'div', path: `body > div:nth-of-type(${n})`, name: `Card ${n}` });
const message = (tab: string, human: boolean, selected: number[], extra: Record<string, unknown> = {}) => JSON.stringify({
  type: 'selection', artifact: 'artboard/b1', tab, human, more: 0, tweaks: [],
  selected: selected.map((n) => ({ ...node(n), text: `Card ${n}`, html: `<div>Card ${n}</div>`, tweaks: [] })),
  nodes: [1, 2, 3].map(node), ...extra,
});
const selectionFile = (root: string) => path.join(root, '.state', 'artboard', 'b1', 'selection.json');

test('a viewer selection is written to selection.json for its artboard', async () => {
  const { server, root } = await start();
  writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
  const ws = await connect(server);
  sendWsText(ws.socket!, message('t1', true, [2]));
  await waitFor(() => fs.existsSync(selectionFile(root)));
  const file = readJson(selectionFile(root));
  expect(file).toMatchObject({ artifact: 'artboard/b1', more: 0, tweaks: [] });
  expect(file.selected.map((entry: { id: string }) => entry.id)).toEqual(['a#2']);
  expect(file.nodes).toHaveLength(3);
  expect(Date.parse(file.updatedAt)).not.toBeNaN();
  ws.socket?.destroy();
});

test('the tab with the latest human change wins; automatic refreshes update only their own tab', async () => {
  const { server, root } = await start();
  writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
  const first = await connect(server);
  const second = await connect(server);
  sendWsText(first.socket!, message('t1', true, [1]));
  await waitFor(() => fs.existsSync(selectionFile(root)) && readJson(selectionFile(root)).selected[0]?.id === 'a#1');
  sendWsText(second.socket!, message('t2', true, [2]));
  await waitFor(() => readJson(selectionFile(root)).selected[0]?.id === 'a#2');
  sendWsText(first.socket!, message('t1', false, []));
  await new Promise((r) => setTimeout(r, 100));
  expect(readJson(selectionFile(root)).selected[0]?.id).toBe('a#2');
  sendWsText(second.socket!, message('t2', false, [3]));
  await waitFor(() => readJson(selectionFile(root)).selected[0]?.id === 'a#3');
  second.socket!.destroy();
  await waitFor(() => fs.existsSync(selectionFile(root)) && readJson(selectionFile(root)).selected.length === 0);
  first.socket!.destroy();
  await waitFor(() => !fs.existsSync(selectionFile(root)));
});

test('a large node map arrives in one frame and invalid selections are ignored', async () => {
  const { server, root } = await start();
  writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
  const ws = await connect(server);
  sendWsText(ws.socket!, message('t1', true, [1], { artifact: 'artboard/missing' }));
  sendWsText(ws.socket!, message('t1', true, [1], { selected: 'nope' }));
  sendWsText(ws.socket!, message('t1', true, [1], { tab: 'x'.repeat(200) }));
  await new Promise((r) => setTimeout(r, 100));
  expect(fs.existsSync(selectionFile(root))).toBe(false);
  const nodes = Array.from({ length: 2500 }, (_, i) => node(i + 1));
  sendWsText(ws.socket!, message('t1', true, [1], { nodes }));
  await waitFor(() => fs.existsSync(selectionFile(root)));
  expect(readJson(selectionFile(root)).nodes).toHaveLength(2500);
  ws.socket?.destroy();
});

test('selection files left by an earlier server are removed at startup and on close', async () => {
  const root = tempRoot().root;
  writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
  fs.mkdirSync(path.dirname(selectionFile(root)), { recursive: true });
  fs.writeFileSync(selectionFile(root), '{"selected":[]}');
  const { server } = await start(root);
  expect(fs.existsSync(selectionFile(root))).toBe(false);
  const ws = await connect(server);
  sendWsText(ws.socket!, message('t1', true, [1]));
  await waitFor(() => fs.existsSync(selectionFile(root)));
  await server.close();
  running = running.filter((s) => s !== server);
  expect(fs.existsSync(selectionFile(root))).toBe(false);
});

test('a rejected message drops the tab instead of leaving its old selection on disk', async () => {
  const { server, root } = await start();
  writeArtboard(root, 'b1', canvas, { 'pages/p/a.html': '<p>a</p>' });
  const ws = await connect(server);
  sendWsText(ws.socket!, message('t1', true, [1]));
  await waitFor(() => fs.existsSync(selectionFile(root)));
  sendWsText(ws.socket!, message('t1', true, [2], { nodes: 'nope' }));
  await waitFor(() => !fs.existsSync(selectionFile(root)));
  ws.socket?.destroy();
});
