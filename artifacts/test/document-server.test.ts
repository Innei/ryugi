import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createLoroBinding } from '@haklex/rich-collab-loro';
import { $getRoot, $isElementNode, $isTextNode, type LexicalNode, type TextNode } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { afterEach, describe, expect, test } from 'vitest';
import { startArtifactsServer, type ArtifactsServer } from '../src/server/app';
import { createDocumentHeadlessEditor } from '../src/server/document-headless';
import { get, openWs, readJson, tempRoot, waitFor, writeDocument, type Fetched } from './helpers';

let running: ArtifactsServer[] = [];

afterEach(async () => {
  await Promise.all(running.map((s) => s.close()));
  running = [];
});

async function start() {
  const { root, viewer } = tempRoot();
  const server = await startArtifactsServer({
    root,
    viewerDir: viewer,
    host: '127.0.0.1',
    urlHost: 'localhost',
    debounceMs: 20,
    documentTiming: { stepDelayMs: 0, writeDelayMs: 5 },
  });
  running.push(server);
  return { server, root };
}

const base = (s: ArtifactsServer) => `http://127.0.0.1:${s.port}`;
const cookie = (s: ArtifactsServer) => `ryugi_artifacts_${s.port}=${s.token}`;
const api = async (s: ArtifactsServer, rel: string) => JSON.parse((await get(`${base(s)}${rel}`, { Cookie: cookie(s) })).body);

function post(url: string, body: Buffer, headers: Record<string, string> = {}): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function $findText(node: LexicalNode, text: string): TextNode | null {
  if ($isTextNode(node) && node.getTextContent() === text) return node;
  if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      const found = $findText(child, text);
      if (found) return found;
    }
  }
  return null;
}

const docFile = (root: string, id: string) => path.join(root, 'document', id, 'doc.xml');
const warningsFile = (root: string, id: string) => path.join(root, '.state', 'document', id, 'warnings.json');

describe('document state API', () => {
  test('returns the Loro snapshot, its lineage and the last outcome', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><h2>Relay</h2></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    const state = await api(server, '/api/document/relay/state');
    expect(typeof state.snapshot).toBe('string');
    expect(state.lineage).toMatch(/@/);
    expect(state.outcome).toEqual({ kind: 'idle' });
    const peer = new LoroDoc();
    expect(() => peer.import(Buffer.from(state.snapshot, 'base64'))).not.toThrow();
  });

  test('is a 404 for a document without doc.xml', async () => {
    const { server, root } = await start();
    writeDocument(root, 'empty', { 'notes.txt': 'x' });
    expect((await get(`${base(server)}/api/document/empty/state`, { Cookie: cookie(server) })).status).toBe(404);
  });
});

describe('live document', () => {
  test('streams an agent edit of doc.xml to open sockets', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: base(server), Host: `127.0.0.1:${server.port}` });
    fs.writeFileSync(docFile(root, 'relay'), fs.readFileSync(docFile(root, 'relay'), 'utf8').replace('</doc>', '<p>two</p></doc>'));
    await waitFor(() => ws.messages.some((m) => JSON.parse(m).type === 'doc-update'));
    const update = ws.messages.map((m) => JSON.parse(m)).find((m) => m.type === 'doc-update');
    expect(update.artifact).toBe('document/relay');
    expect(typeof update.bytes).toBe('string');
    await waitFor(() => ws.messages.some((m) => JSON.parse(m).type === 'doc-status' && JSON.parse(m).outcome.kind === 'merged'));
    ws.socket?.destroy();
  });

  test('a posted browser update reaches doc.xml', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    const state = await api(server, '/api/document/relay/state');
    const peer = new LoroDoc();
    peer.import(Buffer.from(state.snapshot, 'base64'));
    const editor = createDocumentHeadlessEditor();
    const binding = createLoroBinding(editor, peer);
    const from = peer.oplogVersion();
    editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, by hand'), { discrete: true });
    const res = await post(`${base(server)}/api/document/relay/update`, Buffer.from(peer.export({ mode: 'update', from })), {
      Cookie: cookie(server),
      Origin: base(server),
    });
    binding.dispose();
    expect(res.status).toBe(204);
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes('one, by hand'));
  });

  test('a rejected agent edit is a warning in warnings.json', async () => {
    const { root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    fs.writeFileSync(docFile(root, 'relay'), '<doc><p>one</h2></doc>');
    await waitFor(() => readJson(warningsFile(root, 'relay')).warnings.length > 0);
    expect(readJson(warningsFile(root, 'relay')).warnings).toEqual(['agent edit rejected: </h2> closes <p> (doc.xml is left as written; fix it)']);
  });
});

describe('document update endpoint', () => {
  test('refuses requests without the key or from another origin', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    expect((await post(`${base(server)}/api/document/relay/update`, Buffer.from([1]))).status).toBe(403);
    const foreign = await post(`${base(server)}/api/document/relay/update`, Buffer.from([1]), {
      Cookie: cookie(server),
      Origin: 'https://evil.example',
    });
    expect(foreign.status).toBe(403);
  });

  test('refuses an oversize body', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    const res = await post(`${base(server)}/api/document/relay/update`, Buffer.alloc(9 * 1024 * 1024), {
      Cookie: cookie(server),
      Origin: base(server),
      'Transfer-Encoding': 'chunked',
    });
    expect(res.status).toBe(413);
  });

  test('refuses an update from another document', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    const stranger = new LoroDoc();
    const editor = createDocumentHeadlessEditor();
    createLoroBinding(editor, stranger);
    editor.update(() => $getRoot().clear(), { discrete: true });
    const res = await post(`${base(server)}/api/document/relay/update`, Buffer.from(stranger.export({ mode: 'snapshot' })), {
      Cookie: cookie(server),
      Origin: base(server),
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/different document/);
  });
});

describe('comments', () => {
  const commentsFile = (root: string, id: string) => path.join(root, 'document', id, 'comments.json');
  const postJson = (server: ArtifactsServer, id: string, body: unknown) =>
    post(`${base(server)}/api/document/${id}/comments`, Buffer.from(JSON.stringify(body)), {
      Cookie: cookie(server),
      Origin: base(server),
      'Content-Type': 'application/json',
    });

  test('a comment from the page is written to comments.json and pushed to sockets', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">按事件粒度推送</p></doc>' });
    const ws = await openWs(server.port, { Cookie: cookie(server), Origin: base(server), Host: `127.0.0.1:${server.port}` });
    const res = await postJson(server, 'relay', { op: 'create', blockId: 'b1', quote: '事件粒度', text: '离线 7 天？' });
    expect(res.status).toBe(200);
    const saved = readJson(commentsFile(root, 'relay'));
    expect(saved.threads[0].messages[0]).toMatchObject({ author: 'human', text: '离线 7 天？' });
    await waitFor(() => ws.messages.some((m) => JSON.parse(m).type === 'doc-comments'));
    expect((await api(server, '/api/document/relay/state')).comments.threads).toHaveLength(1);
    ws.socket?.destroy();
  });

  test('an agent reply written into the file is kept and filled in', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">x</p></doc>' });
    await postJson(server, 'relay', { op: 'create', blockId: 'b1', quote: 'x', text: 'why?' });
    const file = readJson(commentsFile(root, 'relay'));
    file.threads[0].messages.push({ author: 'agent', text: 'because' });
    fs.writeFileSync(commentsFile(root, 'relay'), JSON.stringify(file));
    await waitFor(() => readJson(commentsFile(root, 'relay')).threads[0].messages[1]?.id !== undefined);
    expect(readJson(commentsFile(root, 'relay')).threads[0].messages[1]).toMatchObject({ author: 'agent', text: 'because' });
  });

  test('a stale agent copy does not drop a reply the page added meanwhile', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">x</p></doc>' });
    await postJson(server, 'relay', { op: 'create', blockId: 'b1', quote: 'x', text: 'why?' });
    const stale = readJson(commentsFile(root, 'relay'));
    const threadId = stale.threads[0].id;
    await postJson(server, 'relay', { op: 'reply', threadId, text: 'and debug builds' });
    stale.threads[0].messages.push({ author: 'agent', text: 'because' });
    fs.writeFileSync(commentsFile(root, 'relay'), JSON.stringify(stale));
    await waitFor(() => readJson(commentsFile(root, 'relay')).threads[0].messages.length === 3);
    expect(readJson(commentsFile(root, 'relay')).threads[0].messages.map((m: { text: string }) => m.text)).toEqual([
      'why?',
      'and debug builds',
      'because',
    ]);
  });

  test('broken comments.json is a warning and is left as written', async () => {
    const { root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">x</p></doc>' });
    await waitFor(() => fs.existsSync(warningsFile(root, 'relay')));
    fs.writeFileSync(commentsFile(root, 'relay'), '{ nope');
    await waitFor(() => readJson(warningsFile(root, 'relay')).warnings.length > 0);
    expect(readJson(warningsFile(root, 'relay')).warnings[0]).toMatch(/^comments.json is not valid/);
    expect(fs.readFileSync(commentsFile(root, 'relay'), 'utf8')).toBe('{ nope');
  });

  test('refuses an op that is not one', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">x</p></doc>' });
    expect((await postJson(server, 'relay', { op: 'erase-all' })).status).toBe(400);
  });
});
