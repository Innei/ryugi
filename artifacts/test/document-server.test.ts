import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { createLoroBinding } from '@haklex/rich-collab-loro';
import { $getRoot, $isElementNode, $isTextNode, type LexicalNode, type TextNode } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { afterEach, describe, expect, test } from 'vitest';

import { type ArtifactsServer, startArtifactsServer } from '../src/server/app';
import type { CloudOptions } from '../src/server/cloud';
import { writeCredentials } from '../src/server/credentials';
import { createDocumentHeadlessEditor } from '../src/server/document-headless';
import { type Fetched, get, openWs, readJson, tempRoot, waitFor, writeDocument } from './helpers';

let running: ArtifactsServer[] = [];

afterEach(async () => {
  await Promise.all(running.map((s) => s.close()));
  running = [];
});

async function start(cloud?: CloudOptions) {
  const { root, viewer } = tempRoot();
  const server = await startArtifactsServer({
    root,
    viewerDir: viewer,
    host: '127.0.0.1',
    urlHost: 'localhost',
    debounceMs: 20,
    documentTiming: { stepDelayMs: 0, writeDelayMs: 5 },
    cloud,
  });
  running.push(server);
  return { server, root };
}

const base = (s: ArtifactsServer) => `http://127.0.0.1:${s.port}`;
const cookie = (s: ArtifactsServer) => `ryugi_artifacts_${s.port}=${s.token}`;
const api = async (s: ArtifactsServer, rel: string) =>
  JSON.parse((await get(`${base(s)}${rel}`, { Cookie: cookie(s) })).body);

function post(url: string, body: Buffer, headers: Record<string, string> = {}): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...headers } },
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
const warningsFile = (root: string, id: string) =>
  path.join(root, '.state', 'document', id, 'warnings.json');

describe('document state API', () => {
  test('document metadata uses the same detected agent identity as artboards', async () => {
    const { server, root } = await start();
    writeDocument(root, 'named', { 'doc.xml': '<doc><h1>Named document</h1></doc>' });
    const agentFile = path.join(root, '.state', 'agent');
    fs.writeFileSync(agentFile, JSON.stringify({ AI_AGENT: 'codex' }));
    expect((await api(server, '/api/artifacts/document/named')).agent).toBe('Codex');
    fs.unlinkSync(agentFile);
    expect((await api(server, '/api/artifacts/document/named')).agent).toBeUndefined();
  });

  test('returns the Loro snapshot, its lineage and the last outcome', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><h2>Relay</h2></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    const state = await api(server, '/api/document/relay/state');
    expect(typeof state.snapshot).toBe('string');
    expect(state.lineage).toMatch(/@/);
    expect(state.outcome).toEqual({ kind: 'idle' });
    expect(state.agentActiveAt).toBeGreaterThan(0);
    expect(Math.abs(state.now - Date.now())).toBeLessThan(5000);
    const peer = new LoroDoc();
    expect(() => peer.import(Buffer.from(state.snapshot, 'base64'))).not.toThrow();
  });

  test('is a 404 for a document without doc.xml', async () => {
    const { server, root } = await start();
    writeDocument(root, 'empty', { 'notes.txt': 'x' });
    expect(
      (await get(`${base(server)}/api/document/empty/state`, { Cookie: cookie(server) })).status,
    ).toBe(404);
  });
});

describe('live document', () => {
  test('streams an agent edit of doc.xml to open sockets', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    const ws = await openWs(server.port, {
      Cookie: cookie(server),
      Origin: base(server),
      Host: `127.0.0.1:${server.port}`,
    });
    fs.writeFileSync(
      docFile(root, 'relay'),
      fs.readFileSync(docFile(root, 'relay'), 'utf8').replace('</doc>', '<p>two</p></doc>'),
    );
    await waitFor(() => ws.messages.some((m) => JSON.parse(m).type === 'doc-update'));
    const update = ws.messages.map((m) => JSON.parse(m)).find((m) => m.type === 'doc-update');
    expect(update.artifact).toBe('document/relay');
    expect(typeof update.bytes).toBe('string');
    await waitFor(() =>
      ws.messages.some(
        (m) => JSON.parse(m).type === 'doc-status' && JSON.parse(m).outcome.kind === 'merged',
      ),
    );
    const status = ws.messages
      .map((m) => JSON.parse(m))
      .find((m) => m.type === 'doc-status' && m.outcome.kind === 'merged');
    expect(status.agentActiveAt).toBe(
      (await api(server, '/api/document/relay/state')).agentActiveAt,
    );
    expect(Math.abs(status.now - Date.now())).toBeLessThan(5000);
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
    editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, by hand'), {
      discrete: true,
    });
    const res = await post(
      `${base(server)}/api/document/relay/update`,
      Buffer.from(peer.export({ mode: 'update', from })),
      {
        Cookie: cookie(server),
        Origin: base(server),
      },
    );
    binding.dispose();
    expect(res.status).toBe(204);
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes('one, by hand'));
  });

  test('a page that does not declare pending support cannot post into a document with pending blocks', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p><pending intent="later"/></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    const state = await api(server, '/api/document/relay/state');
    const peer = new LoroDoc();
    peer.import(Buffer.from(state.snapshot, 'base64'));
    const editor = createDocumentHeadlessEditor();
    const binding = createLoroBinding(editor, peer);
    const from = peer.oplogVersion();
    editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, by hand'), {
      discrete: true,
    });
    const update = Buffer.from(peer.export({ mode: 'update', from }));
    binding.dispose();
    const headers = { Cookie: cookie(server), Origin: base(server) };
    const refused = await post(`${base(server)}/api/document/relay/update`, update, headers);
    expect(refused.status).toBe(409);
    expect(JSON.parse(refused.body).error).toContain('reload the page');
    const accepted = await post(`${base(server)}/api/document/relay/update`, update, {
      ...headers,
      'X-Ryugi-Document-Features': 'pending',
    });
    expect(accepted.status).toBe(204);
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes('one, by hand'));
  });

  test('an edit posted by one page reaches the other open pages', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    const state = await api(server, '/api/document/relay/state');
    const other = new LoroDoc();
    other.import(Buffer.from(state.snapshot, 'base64'));
    const ws = await openWs(server.port, {
      Cookie: cookie(server),
      Origin: base(server),
      Host: `127.0.0.1:${server.port}`,
    });
    const peer = new LoroDoc();
    peer.import(Buffer.from(state.snapshot, 'base64'));
    const editor = createDocumentHeadlessEditor();
    const binding = createLoroBinding(editor, peer);
    const from = peer.oplogVersion();
    editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, from another tab'), {
      discrete: true,
    });
    await post(
      `${base(server)}/api/document/relay/update`,
      Buffer.from(peer.export({ mode: 'update', from })),
      { Cookie: cookie(server), Origin: base(server) },
    );
    binding.dispose();
    await waitFor(() => ws.messages.some((m) => JSON.parse(m).type === 'doc-update'));
    for (const update of ws.messages
      .map((m) => JSON.parse(m))
      .filter((m) => m.type === 'doc-update'))
      other.import(Buffer.from(update.bytes, 'base64'));
    const otherEditor = createDocumentHeadlessEditor();
    const otherBinding = createLoroBinding(otherEditor, other);
    expect(otherEditor.getEditorState().read(() => $getRoot().getTextContent())).toContain(
      'one, from another tab',
    );
    otherBinding.dispose();
    ws.socket?.destroy();
  });

  test('a rejected agent edit is a warning in warnings.json', async () => {
    const { root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    fs.writeFileSync(docFile(root, 'relay'), '<doc><p>one</h2></doc>');
    await waitFor(() => readJson(warningsFile(root, 'relay')).warnings.length > 0);
    expect(readJson(warningsFile(root, 'relay')).warnings).toEqual([
      'agent edit rejected: </h2> closes <p> (doc.xml is left as written; fix it)',
    ]);
  });
});

describe('diagram warnings', () => {
  test('a box-drawing diagram in a code block is a warning until it becomes mermaid', async () => {
    const { root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    const art = '┌───────┐\n│ Cloud │\n└───┬───┘\n    ▼\n┌────────┐\n│ Market │\n└────────┘';
    fs.writeFileSync(
      docFile(root, 'relay'),
      `<doc><p>one</p><codeblock id="flow" lang="text"><![CDATA[${art}]]></codeblock></doc>`,
    );
    await waitFor(
      () =>
        fs.existsSync(warningsFile(root, 'relay')) &&
        readJson(warningsFile(root, 'relay')).warnings.length > 0,
    );
    expect(readJson(warningsFile(root, 'relay')).warnings).toEqual([
      'block flow draws a diagram with box-drawing characters; this document is rendered, not Markdown, so draw it as <mermaid>',
    ]);
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes('<p id='));
    const current = fs.readFileSync(docFile(root, 'relay'), 'utf8');
    fs.writeFileSync(
      docFile(root, 'relay'),
      current.replace(
        /<codeblock id="flow"[\s\S]*?<\/codeblock>/,
        '<mermaid id="flow"><![CDATA[flowchart TD\n  Cloud --> Market]]></mermaid>',
      ),
    );
    await waitFor(() => readJson(warningsFile(root, 'relay')).warnings.length === 0);
  });
});

describe('diagram warnings without ids', () => {
  test('a box-drawing block written without an id is reported once the server stamps it', async () => {
    const { root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    await waitFor(() => fs.readFileSync(docFile(root, 'relay'), 'utf8').includes(' id="'));
    const art = '┌───────┐\n│ Cloud │\n└───┬───┘\n    ▼\n┌────────┐\n│ Market │\n└────────┘';
    const current = fs.readFileSync(docFile(root, 'relay'), 'utf8');
    fs.writeFileSync(
      docFile(root, 'relay'),
      current.replace('</doc>', `<codeblock lang="text"><![CDATA[${art}]]></codeblock></doc>`),
    );
    await waitFor(
      () =>
        fs.existsSync(warningsFile(root, 'relay')) &&
        readJson(warningsFile(root, 'relay')).warnings.length > 0,
    );
    const id = /<codeblock id="([^"]+)"/.exec(fs.readFileSync(docFile(root, 'relay'), 'utf8'))![1];
    expect(readJson(warningsFile(root, 'relay')).warnings[0]).toContain(
      `block ${id} draws a diagram`,
    );
  });

  test('a human removing the diagram in the browser clears its warning', async () => {
    const { server, root } = await start();
    const art = '┌───────┐\n│ Cloud │\n└───┬───┘\n    ▼\n┌────────┐\n│ Market │\n└────────┘';
    writeDocument(root, 'relay', {
      'doc.xml': `<doc><p>one</p><codeblock id="flow" lang="text"><![CDATA[${art}]]></codeblock></doc>`,
    });
    await waitFor(
      () =>
        fs.existsSync(warningsFile(root, 'relay')) &&
        readJson(warningsFile(root, 'relay')).warnings.length > 0,
    );
    const state = await api(server, '/api/document/relay/state');
    const peer = new LoroDoc();
    peer.import(Buffer.from(state.snapshot, 'base64'));
    const editor = createDocumentHeadlessEditor();
    const binding = createLoroBinding(editor, peer);
    const from = peer.oplogVersion();
    editor.update(
      () =>
        $getRoot()
          .getChildren()
          .find((node) => node.getType() === 'code-block')!
          .remove(),
      { discrete: true },
    );
    const res = await post(
      `${base(server)}/api/document/relay/update`,
      Buffer.from(peer.export({ mode: 'update', from })),
      {
        Cookie: cookie(server),
        Origin: base(server),
      },
    );
    binding.dispose();
    expect(res.status).toBe(204);
    await waitFor(() => readJson(warningsFile(root, 'relay')).warnings.length === 0);
  });

  test('a rejected edit shows only the rejection', async () => {
    const { root } = await start();
    const art = '┌───────┐\n│ Cloud │\n└───┬───┘\n    ▼\n┌────────┐\n│ Market │\n└────────┘';
    writeDocument(root, 'relay', {
      'doc.xml': `<doc><p>one</p><codeblock id="flow" lang="text"><![CDATA[${art}]]></codeblock></doc>`,
    });
    await waitFor(
      () =>
        fs.existsSync(warningsFile(root, 'relay')) &&
        readJson(warningsFile(root, 'relay')).warnings.length > 0,
    );
    fs.writeFileSync(
      docFile(root, 'relay'),
      '<doc><p>one</h2><mermaid id="flow"><![CDATA[flowchart TD]]></mermaid></doc>',
    );
    await waitFor(() =>
      readJson(warningsFile(root, 'relay')).warnings.some((w: string) =>
        w.startsWith('agent edit rejected'),
      ),
    );
    expect(readJson(warningsFile(root, 'relay')).warnings).toHaveLength(1);
  });
});

describe('document update endpoint', () => {
  test('refuses requests without the key or from another origin', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    expect((await post(`${base(server)}/api/document/relay/update`, Buffer.from([1]))).status).toBe(
      403,
    );
    const foreign = await post(`${base(server)}/api/document/relay/update`, Buffer.from([1]), {
      Cookie: cookie(server),
      Origin: 'https://evil.example',
    });
    expect(foreign.status).toBe(403);
  });

  test('refuses an oversize body', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p>one</p></doc>' });
    const res = await post(
      `${base(server)}/api/document/relay/update`,
      Buffer.alloc(9 * 1024 * 1024),
      {
        'Cookie': cookie(server),
        'Origin': base(server),
        'Transfer-Encoding': 'chunked',
      },
    );
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
    const res = await post(
      `${base(server)}/api/document/relay/update`,
      Buffer.from(stranger.export({ mode: 'snapshot' })),
      {
        Cookie: cookie(server),
        Origin: base(server),
      },
    );
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/different document/);
  });
});

describe('comments', () => {
  const commentsFile = (root: string, id: string) =>
    path.join(root, 'document', id, 'comments.json');
  const postJson = (server: ArtifactsServer, id: string, body: unknown) =>
    post(`${base(server)}/api/document/${id}/comments`, Buffer.from(JSON.stringify(body)), {
      'Cookie': cookie(server),
      'Origin': base(server),
      'Content-Type': 'application/json',
    });

  test('a comment from the page is written to comments.json and pushed to sockets', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">按事件粒度推送</p></doc>' });
    const ws = await openWs(server.port, {
      Cookie: cookie(server),
      Origin: base(server),
      Host: `127.0.0.1:${server.port}`,
    });
    const res = await postJson(server, 'relay', {
      op: 'create',
      blockId: 'b1',
      quote: '事件粒度',
      text: '离线 7 天？',
    });
    expect(res.status).toBe(200);
    const saved = readJson(commentsFile(root, 'relay'));
    expect(saved.threads[0].messages[0]).toMatchObject({ author: 'human', text: '离线 7 天？' });
    await waitFor(() => ws.messages.some((m) => JSON.parse(m).type === 'doc-comments'));
    expect((await api(server, '/api/document/relay/state')).comments.threads).toHaveLength(1);
    ws.socket?.destroy();
  });

  test('a comment from the page carries the signed-in login', async () => {
    const credentialsFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-creds-')),
      'credentials.json',
    );
    writeCredentials(credentialsFile, { origin: 'https://ryugi.test', token: 't', login: 'innei' });
    const { server, root } = await start({ origin: 'https://ryugi.test', credentialsFile });
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">x</p></doc>' });
    await postJson(server, 'relay', { op: 'create', blockId: 'b1', quote: 'x', text: 'why?' });
    expect(readJson(commentsFile(root, 'relay')).threads[0].messages[0]).toMatchObject({
      author: 'human',
      name: 'innei',
    });
  });

  test('an agent reply is named after the agent that last started the server', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">x</p></doc>' });
    fs.writeFileSync(path.join(root, '.state', 'agent'), JSON.stringify({ CODEX_THREAD_ID: 't1' }));
    await postJson(server, 'relay', { op: 'create', blockId: 'b1', quote: 'x', text: 'why?' });
    const file = readJson(commentsFile(root, 'relay'));
    file.threads[0].messages.push({ author: 'agent', text: 'because' });
    fs.writeFileSync(commentsFile(root, 'relay'), JSON.stringify(file));
    await waitFor(
      () => readJson(commentsFile(root, 'relay')).threads[0].messages[1]?.id !== undefined,
    );
    expect(readJson(commentsFile(root, 'relay')).threads[0].messages[1]).toMatchObject({
      author: 'agent',
      name: 'Codex',
    });
  });

  test('an agent reply written into the file is kept and filled in', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">x</p></doc>' });
    await postJson(server, 'relay', { op: 'create', blockId: 'b1', quote: 'x', text: 'why?' });
    const file = readJson(commentsFile(root, 'relay'));
    file.threads[0].messages.push({ author: 'agent', text: 'because' });
    fs.writeFileSync(commentsFile(root, 'relay'), JSON.stringify(file));
    await waitFor(
      () => readJson(commentsFile(root, 'relay')).threads[0].messages[1]?.id !== undefined,
    );
    expect(readJson(commentsFile(root, 'relay')).threads[0].messages[1]).toMatchObject({
      author: 'agent',
      text: 'because',
    });
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
    expect(
      readJson(commentsFile(root, 'relay')).threads[0].messages.map(
        (m: { text: string }) => m.text,
      ),
    ).toEqual(['why?', 'and debug builds', 'because']);
  });

  test('broken comments.json is a warning and is left as written', async () => {
    const { root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">x</p></doc>' });
    await waitFor(() => fs.existsSync(warningsFile(root, 'relay')));
    fs.writeFileSync(commentsFile(root, 'relay'), '{ nope');
    await waitFor(() => readJson(warningsFile(root, 'relay')).warnings.length > 0);
    expect(readJson(warningsFile(root, 'relay')).warnings[0]).toMatch(
      /^comments.json is not valid/,
    );
    expect(fs.readFileSync(commentsFile(root, 'relay'), 'utf8')).toBe('{ nope');
  });

  test('refuses an op that is not one', async () => {
    const { server, root } = await start();
    writeDocument(root, 'relay', { 'doc.xml': '<doc><p id="b1">x</p></doc>' });
    expect((await postJson(server, 'relay', { op: 'erase-all' })).status).toBe(400);
  });
});

describe('agent comments', () => {
  const commentsFile = (root: string, id: string) =>
    path.join(root, 'document', id, 'comments.json');
  const cursorsFile = (root: string, id: string) =>
    path.join(root, '.state', 'document', id, 'comment-cursors.json');
  const agentCall = (
    server: ArtifactsServer,
    id: string,
    body: unknown,
    key: string | null = server.token,
    headers: Record<string, string> = {},
  ) =>
    post(
      `${base(server)}/api/agent/document/${id}/comments${key === null ? '' : `?key=${key}`}`,
      Buffer.from(JSON.stringify(body)),
      {
        'Content-Type': 'application/json',
        ...headers,
      },
    );
  const human = (server: ArtifactsServer, id: string, body: unknown) =>
    post(`${base(server)}/api/document/${id}/comments`, Buffer.from(JSON.stringify(body)), {
      'Cookie': cookie(server),
      'Origin': base(server),
      'Content-Type': 'application/json',
    });
  const relay = async () => {
    const started = await start();
    writeDocument(started.root, 'relay', {
      'doc.xml': '<doc><p id="b1">按事件粒度推送</p><p id="b2">阈值</p></doc>',
    });
    return started;
  };

  test('add opens a thread named after the agent the CLI sent', async () => {
    const { server, root } = await relay();
    fs.writeFileSync(path.join(root, '.state', 'agent'), JSON.stringify({ CLAUDECODE: '1' }));
    const res = await agentCall(server, 'relay', {
      op: 'add',
      blockId: 'b2',
      quote: '阈值',
      text: '7 天合适吗？',
      agent: 'Codex',
    });
    expect(res.status).toBe(200);
    const { threadId, messageId } = JSON.parse(res.body);
    const thread = readJson(commentsFile(root, 'relay')).threads[0];
    expect(thread).toMatchObject({
      id: threadId,
      anchor: { blockId: 'b2', quote: '阈值' },
      status: 'open',
      statusBy: 'agent',
    });
    expect(thread.messages[0]).toMatchObject({
      id: messageId,
      author: 'agent',
      name: 'Codex',
      text: '7 天合适吗？',
    });
  });

  test('a reply without an agent name falls back to the agent that started the server', async () => {
    const { server, root } = await relay();
    fs.writeFileSync(path.join(root, '.state', 'agent'), JSON.stringify({ CLAUDECODE: '1' }));
    await human(server, 'relay', { op: 'create', blockId: 'b1', quote: '', text: 'why?' });
    const threadId = readJson(commentsFile(root, 'relay')).threads[0].id;
    expect(
      (await agentCall(server, 'relay', { op: 'reply', threadId, text: 'because' })).status,
    ).toBe(200);
    expect(readJson(commentsFile(root, 'relay')).threads[0].messages[1]).toMatchObject({
      author: 'agent',
      name: 'Claude Code',
      text: 'because',
    });
  });

  test('resolve marks the thread resolved by the agent and pushes it to sockets', async () => {
    const { server, root } = await relay();
    await human(server, 'relay', { op: 'create', blockId: 'b1', quote: '', text: 'why?' });
    const threadId = readJson(commentsFile(root, 'relay')).threads[0].id;
    const ws = await openWs(server.port, {
      Cookie: cookie(server),
      Origin: base(server),
      Host: `127.0.0.1:${server.port}`,
    });
    expect(
      (await agentCall(server, 'relay', { op: 'resolve', threadId, agent: 'Codex' })).status,
    ).toBe(200);
    expect(readJson(commentsFile(root, 'relay')).threads[0]).toMatchObject({
      status: 'resolved',
      statusBy: 'agent',
    });
    await waitFor(() => ws.messages.some((m) => JSON.parse(m).type === 'doc-comments'));
    ws.socket?.destroy();
  });

  test('list returns unread threads once per agent, and all leaves the cursor alone', async () => {
    const { server, root } = await relay();
    await human(server, 'relay', { op: 'create', blockId: 'b1', quote: '事件', text: 'why?' });
    const list = async (agent: string, all = false) =>
      JSON.parse((await agentCall(server, 'relay', { op: 'list', agent, all })).body);
    const first = await list('Codex');
    expect(first).toMatchObject({ type: 'comments', artifact: 'document/relay' });
    expect(first.threads).toHaveLength(1);
    expect(first.threads[0]).toMatchObject({
      anchor: { blockId: 'b1', quote: '事件' },
      changes: ['new-thread'],
      waitingOn: 'agent',
    });
    expect((await list('Codex')).threads).toEqual([]);
    expect((await list('Claude Code')).threads).toHaveLength(1);
    expect((await list('Codex', true)).threads).toHaveLength(1);
    expect((await list('Codex')).threads).toEqual([]);
    expect(Object.keys(readJson(cursorsFile(root, 'relay'))).sort()).toEqual([
      'Claude Code',
      'Codex',
    ]);
    const threadId = first.threads[0].id;
    await agentCall(server, 'relay', { op: 'reply', threadId, text: 'because', agent: 'Codex' });
    expect((await list('Codex')).threads).toEqual([]);
    await human(server, 'relay', { op: 'reply', threadId, text: 'and?' });
    expect((await list('Codex')).threads[0].changes).toEqual(['new-message']);
  });

  test('list without an agent name keeps its cursor under Agent', async () => {
    const { server, root } = await relay();
    await human(server, 'relay', { op: 'create', blockId: 'b1', quote: '', text: 'why?' });
    await agentCall(server, 'relay', { op: 'list' });
    expect(Object.keys(readJson(cursorsFile(root, 'relay')))).toEqual(['Agent']);
  });

  test('a corrupt cursor file reads as no cursor', async () => {
    const { server, root } = await relay();
    await human(server, 'relay', { op: 'create', blockId: 'b1', quote: '', text: 'why?' });
    fs.mkdirSync(path.dirname(cursorsFile(root, 'relay')), { recursive: true });
    fs.writeFileSync(cursorsFile(root, 'relay'), '{ nope');
    expect(
      JSON.parse((await agentCall(server, 'relay', { op: 'list', agent: 'Codex' })).body).threads,
    ).toHaveLength(1);
  });

  test('only a local process can call it; a browser page, even the viewer, cannot', async () => {
    const { server } = await relay();
    expect((await agentCall(server, 'relay', { op: 'list' }, null)).status).toBe(200);
    expect(
      (
        await agentCall(server, 'relay', { op: 'list' }, null, {
          Cookie: cookie(server),
          Origin: base(server),
        })
      ).status,
    ).toBe(403);
  });

  test('refuses human ops, bad ids and empty text', async () => {
    const { server, root } = await relay();
    await human(server, 'relay', { op: 'create', blockId: 'b1', quote: '', text: 'why?' });
    const { id: threadId, messages } = readJson(commentsFile(root, 'relay')).threads[0];
    const refused = async (body: unknown) => {
      const res = await agentCall(server, 'relay', body);
      return [res.status, JSON.parse(res.body).error];
    };
    expect(
      await refused({ op: 'edit', threadId, messageId: messages[0].id, text: 'hijack' }),
    ).toEqual([400, expect.any(String)]);
    expect(await refused({ op: 'delete', threadId, messageId: messages[0].id })).toEqual([
      400,
      expect.any(String),
    ]);
    expect(await refused({ op: 'reply', threadId: 'missing', text: 'x' })).toEqual([
      400,
      expect.stringContaining('missing'),
    ]);
    expect(await refused({ op: 'reply', threadId, text: '' })).toEqual([400, expect.any(String)]);
    expect(await refused({ op: 'add', blockId: 'nope', text: 'x' })).toEqual([
      400,
      expect.stringContaining('nope'),
    ]);
    expect(readJson(commentsFile(root, 'relay')).threads[0].messages).toHaveLength(1);
  });

  test('an unknown document is a 404', async () => {
    const { server } = await relay();
    expect((await agentCall(server, 'missing', { op: 'list' })).status).toBe(404);
  });
});
