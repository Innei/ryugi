import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { startArtifactsServer, type ArtifactsServer } from '../src/server/app';
import { get, openWs, readJson, tempRoot, waitFor, writeArtboard, type Fetched } from './helpers';

let running: ArtifactsServer[] = [];
afterEach(async () => {
  await Promise.all(running.map((s) => s.close()));
  running = [];
});

const canvas = {
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: { a: { file: 'pages/a.html', page: 'p', x: 0, y: 0, w: 100, h: 100 } },
};

async function start() {
  const { root, viewer } = tempRoot();
  writeArtboard(root, 'review', canvas, { 'pages/a.html': '<html><body><p>a</p></body></html>' });
  const server = await startArtifactsServer({
    root,
    viewerDir: viewer,
    host: '127.0.0.1',
    urlHost: 'localhost',
    debounceMs: 20,
  });
  running.push(server);
  return { server, root };
}

const base = (s: ArtifactsServer) => `http://127.0.0.1:${s.port}`;
const cookie = (s: ArtifactsServer) => `ryugi_artifacts_${s.port}=${s.token}`;
const commentsFile = (root: string) => path.join(root, 'artboard', 'review', 'comments.json');

function post(url: string, body: unknown, headers: Record<string, string> = {}): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }),
        );
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

const human = (server: ArtifactsServer, body: unknown, id = 'review', origin = base(server)) =>
  post(`${base(server)}/api/artboard/${id}/comments`, body, {
    Cookie: cookie(server),
    Origin: origin,
  });
const agent = (server: ArtifactsServer, body: unknown) =>
  post(`${base(server)}/api/agent/artboard/review/comments?key=${server.token}`, body);
const anchor = {
  page: 'p',
  board: 'a',
  x: 10,
  y: 10,
  nodes: [{ board: 'a', path: 'body > p' }],
  offset: { x: 0.5, y: 0.5 },
};

test('a comment from the page is saved, pushed to sockets and served with the artboard', async () => {
  const { server, root } = await start();
  const ws = await openWs(server.port, {
    Cookie: cookie(server),
    Origin: base(server),
    Host: `127.0.0.1:${server.port}`,
  });
  const res = await human(server, { op: 'create', anchor, text: '开关没对齐' });
  expect(res.status).toBe(200);
  expect(JSON.parse(res.body)).toMatchObject({
    comments: { threads: [{ anchor: { board: 'a' } }] },
    stale: [],
  });
  expect(readJson(commentsFile(root)).threads[0].messages[0]).toMatchObject({
    author: 'human',
    text: '开关没对齐',
  });
  await waitFor(() => ws.messages.some((m) => JSON.parse(m).type === 'board-comments'));
  const payload = JSON.parse(
    (await get(`${base(server)}/api/artifacts/artboard/review`, { Cookie: cookie(server) })).body,
  );
  expect(payload.comments.threads).toHaveLength(1);
  expect(payload.staleThreads).toEqual([]);
  ws.socket?.destroy();
});

test('a board rewrite marks the thread stale for the page', async () => {
  const { server, root } = await start();
  await human(server, { op: 'create', anchor, text: 'x' });
  fs.writeFileSync(
    path.join(root, 'artboard', 'review', 'pages', 'a.html'),
    '<html><body><p>a2</p></body></html>',
  );
  const until = Date.now() + 3000;
  let stale: string[] = [];
  while (stale.length === 0 && Date.now() < until) {
    stale = JSON.parse(
      (await get(`${base(server)}/api/artifacts/artboard/review`, { Cookie: cookie(server) })).body,
    ).staleThreads;
    if (stale.length === 0) await new Promise((resolve) => setTimeout(resolve, 30));
  }
  expect(stale).toHaveLength(1);
});

test('refuses a cross-origin page write, a bad op and an unknown artboard', async () => {
  const { server } = await start();
  expect(
    (await human(server, { op: 'create', anchor, text: 'x' }, 'review', 'https://evil.example'))
      .status,
  ).toBe(403);
  expect((await human(server, { op: 'create', anchor: { page: 'p' }, text: 'x' })).status).toBe(
    400,
  );
  expect((await human(server, { op: 'create', anchor, text: 'x' }, 'nope')).status).toBe(404);
});

test('the agent lists, replies to and resolves page comments', async () => {
  const { server, root } = await start();
  await human(server, { op: 'create', anchor, text: '开关没对齐' });
  const listed = JSON.parse((await agent(server, { op: 'list', agent: 'Codex' })).body);
  expect(listed).toMatchObject({
    type: 'comments',
    artifact: 'artboard/review',
    threads: [{ stale: false, waitingOn: 'agent', files: { a: 'pages/a.html' } }],
  });
  const threadId = listed.threads[0].id;
  expect(
    (await agent(server, { op: 'reply', threadId, text: '改好了', agent: 'Codex' })).status,
  ).toBe(200);
  expect((await agent(server, { op: 'resolve', threadId })).status).toBe(200);
  expect(readJson(commentsFile(root)).threads[0]).toMatchObject({
    status: 'resolved',
    messages: [{}, { author: 'agent', name: 'Codex', text: '改好了' }],
  });
});

test('the agent adds a thread on an existing board only', async () => {
  const { server } = await start();
  const added = await agent(server, {
    op: 'add',
    anchor: { page: 'p', board: 'a', x: 100, y: 0 },
    text: '不确定',
  });
  expect(added.status).toBe(200);
  expect(JSON.parse(added.body)).toMatchObject({ threadId: expect.any(String) });
  const missing = await agent(server, {
    op: 'add',
    anchor: { page: 'p', board: 'zz', x: 0, y: 0 },
    text: 'x',
  });
  expect(missing.status).toBe(400);
  expect(JSON.parse(missing.body).error).toBe('no board zz in artboard/review');
});

test('a verdict on a group that is not a verify group is refused, and list reports verify groups', async () => {
  const { root, viewer } = tempRoot();
  writeArtboard(
    root,
    'review',
    { ...canvas, groups: { g: { title: '验收', boards: ['a'], verify: true }, h: { boards: [] } } },
    { 'pages/a.html': '<html><body><p>a</p></body></html>' },
  );
  const server = await startArtifactsServer({
    root,
    viewerDir: viewer,
    host: '127.0.0.1',
    urlHost: 'localhost',
    debounceMs: 20,
  });
  running.push(server);
  const refused = await human(server, {
    op: 'create',
    anchor: { page: 'p', group: 'h', verdict: 'pass', x: 0, y: 0 },
    text: '通过',
  });
  expect(refused.status).toBe(400);
  expect(JSON.parse(refused.body).error).toBe('no verify group h in artboard/review');
  expect(
    (
      await human(server, {
        op: 'create',
        anchor: { page: 'p', group: 'g', verdict: 'reject', x: 0, y: 0 },
        text: '字号小了',
      })
    ).status,
  ).toBe(200);
  const listed = JSON.parse((await agent(server, { op: 'list', all: true })).body);
  expect(listed.groups).toEqual([
    {
      id: 'g',
      page: 'p',
      title: '验收',
      verdict: 'reject',
      at: expect.any(String),
      evidenceUpdated: false,
      rejectThreads: 1,
      boards: ['a'],
    },
  ]);
});
