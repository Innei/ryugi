import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import type { IncomingHttpHeaders } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createLoroBinding } from '@haklex/rich-collab-loro';
import { $getRoot, $isElementNode, $isTextNode, type LexicalNode, type TextNode } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { afterEach, describe, expect, test } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { startArtifactsServer } from '../src/server/app';
import { updateArtifactConfig } from '../src/server/config';
import { writeCredentials } from '../src/server/credentials';
import { createDocumentHeadlessEditor } from '../src/server/document-headless';
import { createRelayClient } from '../src/server/relay';
import { tempRoot, writeArtboard, writeDocument, writeHtml } from './helpers';

interface Hub {
  url: string;
  headers: IncomingHttpHeaders[];
  sockets: WebSocket[];
  messages: any[];
  next(t: string, timeoutMs?: number): Promise<any>;
  send(message: unknown): void;
  close(): Promise<void>;
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fakeHub(): Promise<Hub> {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => server.once('listening', resolve));
  const hub: Hub = {
    url: `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/relay/host`,
    headers: [],
    sockets: [],
    messages: [],
    next: (t, timeoutMs = 5000) =>
      new Promise((resolve, reject) => {
        const until = Date.now() + timeoutMs;
        const tick = () => {
          const i = hub.messages.findIndex((m) => m.t === t);
          if (i >= 0) return resolve(hub.messages.splice(i, 1)[0]);
          if (Date.now() > until) return reject(new Error(`no ${t}`));
          setTimeout(tick, 10);
        };
        tick();
      }),
    send: (message) => hub.sockets.at(-1)!.send(JSON.stringify(message)),
    close: () => new Promise((resolve) => { for (const s of hub.sockets) s.terminate(); server.close(() => resolve()); }),
  };
  server.on('connection', (socket, req) => {
    hub.headers.push(req.headers);
    hub.sockets.push(socket);
    socket.on('message', (data) => {
      const text = data.toString();
      if (text === 'ping') return socket.send('pong');
      hub.messages.push(JSON.parse(text));
    });
  });
  cleanups.push(() => hub.close());
  return hub;
}

async function start({ signedIn = true, published = true, hub, credentialsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-home-')), 'credentials.json') }: { signedIn?: boolean; published?: boolean; hub: Hub; credentialsFile?: string }) {
  const temp = tempRoot();
  const configFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-dir-')), 'config.json');
  if (signedIn) writeCredentials(credentialsFile, { origin: 'https://cloud.example', token: 'tok', login: 'innei' });
  writeDocument(temp.root, 'plan', { 'doc.xml': '<doc><p>one</p></doc>' });
  if (published) updateArtifactConfig(configFile, 'document/plan', { cloud: { id: 'cloudplan', url: 'u', publishedAt: '2026-10-21T00:00:00Z', visibility: 'private' } });
  const server = await startArtifactsServer({
    root: temp.root,
    viewerDir: temp.viewer,
    runtimeDir: temp.runtime,
    host: '127.0.0.1',
    urlHost: 'localhost',
    configFile,
    cloud: { origin: 'https://cloud.example', credentialsFile },
    relay: { url: hub.url, version: '1.13.0', pollMs: 50 },
  });
  cleanups.push(() => server.close());
  return { server, root: temp.root, configFile, credentialsFile };
}

let rid = 0;
async function request(hub: Hub, body: unknown, id = 'cloudplan') {
  const mine = ++rid;
  hub.send({ t: 'request', conn: 'v1', id, rid: mine, body });
  for (;;) {
    const reply = await hub.next('reply');
    if (reply.rid === mine) return reply;
  }
}

async function waitFor(check: () => boolean, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function stampedBlockId(root: string) {
  const file = path.join(root, 'document/plan/doc.xml');
  await waitFor(() => / id="/.test(fs.readFileSync(file, 'utf8')));
  return fs.readFileSync(file, 'utf8').match(/ id="([^"]+)"/)![1]!;
}

function $findText(node: LexicalNode, text: string): TextNode | null {
  if ($isTextNode(node) && node.getTextContent() === text) return node;
  if ($isElementNode(node)) for (const child of node.getChildren()) { const found = $findText(child, text); if (found) return found; }
  return null;
}

describe('connecting', () => {
  test('a signed-in server with a published document announces it with its token and where it listens', async () => {
    const hub = await fakeHub();
    const { server } = await start({ hub });
    const hello = await hub.next('hello');
    expect(hello).toEqual({ t: 'hello', version: '1.13.0', ids: ['cloudplan'], local: { hostId: expect.stringMatching(/^[A-Za-z0-9_-]{16,64}$/), port: server.port, key: server.token } });
    expect(hub.headers[0]!.authorization).toBe('Bearer tok');
  });

  test('every server on this computer reports the same host id', async () => {
    const hub = await fakeHub();
    const { credentialsFile } = await start({ hub });
    const first = (await hub.next('hello')).local.hostId;
    const again = await fakeHub();
    await start({ hub: again, credentialsFile });
    expect((await again.next('hello')).local.hostId).toBe(first);
  });

  test('published artboards and html are announced next to documents', async () => {
    const hub = await fakeHub();
    const { root, configFile } = await start({ hub, published: false });
    writeHtml(root, 'page', { 'index.html': '<p>hi</p>' });
    writeArtboard(root, 'board', { title: 'Board', groups: [] });
    updateArtifactConfig(configFile, 'html/page', { cloud: { id: 'cloudpage', url: 'u', publishedAt: null, visibility: 'private' } });
    updateArtifactConfig(configFile, 'artboard/board', { cloud: { id: 'cloudboard', url: 'u', publishedAt: null, visibility: 'private' } });
    expect((await hub.next('hello')).ids).toEqual(['cloudboard', 'cloudpage']);
  });

  test('stays away while signed out or with nothing published, and connects once that changes', async () => {
    const hub = await fakeHub();
    const { configFile } = await start({ hub, published: false });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(hub.sockets).toHaveLength(0);
    updateArtifactConfig(configFile, 'document/plan', { cloud: { id: 'cloudplan', url: 'u', publishedAt: 't', visibility: 'private' } });
    expect(await hub.next('hello')).toMatchObject({ ids: ['cloudplan'] });
  });

  test('reconnects after the hub drops it', async () => {
    const hub = await fakeHub();
    await start({ hub });
    await hub.next('hello');
    hub.sockets[0]!.terminate();
    expect(await hub.next('hello', 8000)).toMatchObject({ ids: ['cloudplan'] });
  }, 15000);
});

describe('requests', () => {
  test('state carries the Loro snapshot and comments', async () => {
    const hub = await fakeHub();
    await start({ hub });
    await hub.next('hello');
    const reply = await request(hub, { op: 'state' });
    expect(reply.conn).toBe('v1');
    expect(reply.body.ok).toBe(true);
    expect(typeof reply.body.data.snapshot).toBe('string');
    expect(reply.body.data.comments).toEqual({ version: 1, threads: [] });
  });

  test('meta carries the title and where its files live', async () => {
    const hub = await fakeHub();
    await start({ hub });
    await hub.next('hello');
    const reply = await request(hub, { op: 'meta' });
    expect(reply.body.ok).toBe(true);
    expect(reply.body.data).toMatchObject({ title: 'plan', contentBase: expect.stringContaining('/document/plan/') });
  });

  test('a comment op lands in comments.json as the human', async () => {
    const hub = await fakeHub();
    const { root } = await start({ hub });
    await hub.next('hello');
    const blockId = await stampedBlockId(root);
    const reply = await request(hub, { op: 'comment', comment: { op: 'create', blockId, quote: 'one', text: 'from the phone' } });
    expect(reply.body.ok).toBe(true);
    const file = JSON.parse(fs.readFileSync(path.join(root, 'document/plan/comments.json'), 'utf8'));
    expect(file.threads[0].messages[0]).toMatchObject({ author: 'human', text: 'from the phone' });
  });

  test('a Loro update from the phone reaches doc.xml', async () => {
    const hub = await fakeHub();
    const { root } = await start({ hub });
    await hub.next('hello');
    await waitFor(() => fs.readFileSync(path.join(root, 'document/plan/doc.xml'), 'utf8').includes(' id="'));
    const state = (await request(hub, { op: 'state' })).body.data;
    const peer = new LoroDoc();
    peer.import(Buffer.from(state.snapshot, 'base64'));
    const editor = createDocumentHeadlessEditor();
    const binding = createLoroBinding(editor, peer);
    const from = peer.oplogVersion();
    editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, from the phone'), { discrete: true });
    const reply = await request(hub, { op: 'update', bytes: Buffer.from(peer.export({ mode: 'update', from })).toString('base64') });
    binding.dispose();
    expect(reply.body.ok).toBe(true);
    await waitFor(() => fs.readFileSync(path.join(root, 'document/plan/doc.xml'), 'utf8').includes('one, from the phone'));
  });

  test('a selection from the phone is written for the hook', async () => {
    const hub = await fakeHub();
    const { root } = await start({ hub });
    await hub.next('hello');
    const reply = await request(hub, { op: 'selection', selection: { type: 'selection', artifact: 'document/cloudplan', tab: 't1', human: true, quote: 'one', blockIds: [], heading: '' } });
    expect(reply.body.ok).toBe(true);
    await waitFor(() => fs.existsSync(path.join(root, '.state/document/plan/selection.json')));
    expect(JSON.parse(fs.readFileSync(path.join(root, '.state/document/plan/selection.json'), 'utf8'))).toMatchObject({ artifact: 'document/plan', quote: 'one' });
  });

  test('requests for documents it does not serve, or unknown ops, are refused', async () => {
    const hub = await fakeHub();
    await start({ hub });
    await hub.next('hello');
    expect((await request(hub, { op: 'state' }, 'someone-else')).body).toEqual({ ok: false, error: 'not served here' });
    expect((await request(hub, { op: 'rm -rf' })).body).toEqual({ ok: false, error: 'unknown request' });
  });

  test('a request counts as activity so the idle timer does not stop the server', async () => {
    const hub = await fakeHub();
    const { server } = await start({ hub });
    await hub.next('hello');
    let touched = 0;
    server.onActivity(() => touched++);
    await request(hub, { op: 'meta' });
    expect(touched).toBeGreaterThan(0);
  });
});

describe('keeping the server awake', () => {
  test('an open viewer counts as activity even when it sends nothing', async () => {
    const hub = await fakeHub();
    let touched = 0;
    const client = createRelayClient({
      url: hub.url,
      version: '1.13.0',
      pollMs: 50,
      heartbeatMs: 50,
      token: () => 'tok',
      served: () => new Map([['cloudplan', 'document/plan']]),
      handle: async () => null,
      onActivity: () => touched++,
    });
    cleanups.push(() => client.close());
    await hub.next('hello');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(touched).toBe(0);
    hub.send({ t: 'watch', ids: ['cloudplan'] });
    await waitFor(() => touched > 0);
    hub.send({ t: 'watch', ids: [] });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const settled = touched;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(touched).toBe(settled);
  });
});

describe('events', () => {
  test('changes are forwarded only for documents someone is watching', async () => {
    const hub = await fakeHub();
    const { root } = await start({ hub });
    await hub.next('hello');
    const blockId = await stampedBlockId(root);
    await request(hub, { op: 'comment', comment: { op: 'create', blockId, quote: 'one', text: 'unwatched' } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(hub.messages.filter((m) => m.t === 'event')).toEqual([]);
    hub.send({ t: 'watch', ids: ['cloudplan'] });
    await request(hub, { op: 'comment', comment: { op: 'create', blockId, quote: 'one', text: 'watched' } });
    const event = await hub.next('event');
    expect(event).toMatchObject({ t: 'event', id: 'cloudplan', body: { type: 'doc-comments' } });
  });
});

describe('edits travel both ways', () => {
  test('an edit from the phone is sent back out to everyone watching', async () => {
    const hub = await fakeHub();
    const { root } = await start({ hub });
    await hub.next('hello');
    await stampedBlockId(root);
    hub.send({ t: 'watch', ids: ['cloudplan'] });
    const state = (await request(hub, { op: 'state' })).body.data;
    const peer = new LoroDoc();
    peer.import(Buffer.from(state.snapshot, 'base64'));
    const editor = createDocumentHeadlessEditor();
    const binding = createLoroBinding(editor, peer);
    const from = peer.oplogVersion();
    editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, from the phone'), { discrete: true });
    await request(hub, { op: 'update', bytes: Buffer.from(peer.export({ mode: 'update', from })).toString('base64') });
    binding.dispose();
    await waitFor(() => hub.messages.some((m) => m.t === 'event' && m.body?.type === 'doc-update'));
  });
});

test('a server started by the CLI tells the relay its release version', async () => {
  const hub = await fakeHub();
  const origin = hub.url.replace(/^ws/, 'http').replace(/\/api\/relay\/host$/, '');
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-project-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-xdg-'));
  writeCredentials(path.join(home, 'ryugi', 'credentials.json'), { origin, token: 'tok', login: 'innei' });
  writeDocument(path.join(project, '.ryugi', 'artifacts'), 'plan', { 'doc.xml': '<doc><p>one</p></doc>' });
  updateArtifactConfig(path.join(project, '.ryugi', 'config.json'), 'document/plan', {
    cloud: { id: 'cloudplan', url: 'u', publishedAt: '2026-10-21T00:00:00Z', visibility: 'private' },
  });
  const cli = path.resolve(__dirname, '../dist/cli.cjs');
  const env = { ...process.env, RYUGI_CLOUD_ORIGIN: origin, XDG_CONFIG_HOME: home, RYUGI_ARTIFACTS_OWNER: String(process.pid), RYUGI_ARTIFACTS_VERSION: '0.0.0-launcher' };
  execFileSync(process.execPath, [cli, 'start', '--json', '--no-open', '--project-dir', project], { env, encoding: 'utf8' });
  cleanups.push(() => void execFileSync(process.execPath, [cli, 'stop', '--project-dir', project], { env, encoding: 'utf8' }));
  const hello = await hub.next('hello', 15_000);
  expect(hello.version).toBe(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).version);
  expect(hello.ids).toEqual(['cloudplan']);
}, 30_000);

describe('a relay that never finishes the handshake', () => {
  async function stalledServer() {
    const sockets: net.Socket[] = [];
    const server = net.createServer((socket) => sockets.push(socket));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise<void>((resolve) => { for (const s of sockets) s.destroy(); server.close(() => resolve()); }));
    return { url: `ws://127.0.0.1:${(server.address() as net.AddressInfo).port}/api/relay/host`, sockets };
  }

  test('signing out mid-handshake does not crash the server', async () => {
    const stalled = await stalledServer();
    const errors: unknown[] = [];
    const onError = (err: unknown) => errors.push(err);
    process.on('uncaughtException', onError);
    cleanups.push(() => void process.off('uncaughtException', onError));
    let token: string | null = 'tok';
    const client = createRelayClient({ url: stalled.url, version: 't', pollMs: 20, token: () => token, served: () => new Map([['c1', 'document/plan']]), handle: async () => null, onActivity: () => {} });
    cleanups.push(() => client.close());
    await waitFor(() => stalled.sockets.length === 1);
    token = null;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(errors).toEqual([]);
  });

  test('a stalled handshake gives up and tries again', async () => {
    const stalled = await stalledServer();
    const client = createRelayClient({ url: stalled.url, version: 't', pollMs: 20, handshakeTimeoutMs: 100, token: () => 'tok', served: () => new Map([['c1', 'document/plan']]), handle: async () => null, onActivity: () => {} });
    cleanups.push(() => client.close());
    await waitFor(() => stalled.sockets.length >= 2, 3000);
  });
});
