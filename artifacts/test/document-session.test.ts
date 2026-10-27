import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoroBinding } from '@haklex/rich-collab-loro';
import { allHeadlessNodes } from '@haklex/rich-headless';
import { createHeadlessEditor } from '@lexical/headless';
import { $getRoot, $isElementNode, $isTextNode, type LexicalNode, type TextNode } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { afterEach, expect, test } from 'vitest';
import { createDocumentHeadlessEditor } from '../src/server/document-headless';
import {
  createDocumentSession,
  type DocumentEvent,
  type DocumentSession,
} from '../src/server/document-session';

let sessions: DocumentSession[] = [];

afterEach(async () => {
  await Promise.all(sessions.map((s) => s.close()));
  sessions = [];
});

function setup(xml: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'document-session-'));
  const file = path.join(dir, 'doc.xml');
  const snapshotFile = path.join(dir, 'state', 'doc.loro');
  fs.writeFileSync(file, xml);
  return { dir, file, snapshotFile };
}

async function open(file: string, snapshotFile: string, stepDelayMs = 0) {
  const session = await createDocumentSession({ file, snapshotFile, stepDelayMs, writeDelayMs: 5 });
  sessions.push(session);
  return session;
}

const read = (file: string) => fs.readFileSync(file, 'utf8');
const blockIds = (xml: string) => [...xml.matchAll(/^ {2}<\w+ id="([^"]+)"/gm)].map((m) => m[1]);

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

test('stamps block ids into the file on load', async () => {
  const { file, snapshotFile } = setup('<doc><h2>Relay</h2><p>one</p></doc>');
  const session = await open(file, snapshotFile);
  await session.flush();
  const ids = blockIds(read(file));
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
});

test('a chart keeps the block id the agent gave it, so comments on it stay anchored', async () => {
  const spec =
    '{"version":1,"type":"bar","x":"day","series":[{"key":"n"}],"data":[{"day":"10-09","n":14}]}';
  const { file, snapshotFile } = setup(
    `<doc><h2 id="h1">Relay</h2><chart id="c1"><![CDATA[${spec}]]></chart></doc>`,
  );
  const session = await open(file, snapshotFile);
  await session.flush();
  expect(blockIds(read(file))).toEqual(['h1', 'c1']);
});

test('merges an agent edit and reports the block stats', async () => {
  const { file, snapshotFile } = setup('<doc><h2>Relay</h2><p>one</p></doc>');
  const session = await open(file, snapshotFile);
  await session.flush();
  const agentText = read(file).replace('</doc>', '  <p>two</p>\n</doc>');
  fs.writeFileSync(file, agentText);
  session.onFileText(agentText);
  await session.flush();
  expect(read(file)).toContain('two</p>');
  expect(blockIds(read(file))).toHaveLength(3);
  expect(session.outcome()).toEqual({ kind: 'merged', stats: '+1 ~0 -0 blocks' });
});

test('a human edit made before the agent edit lands survives the merge', async () => {
  const { file, snapshotFile } = setup('<doc><h2>Relay</h2><p>one</p></doc>');
  const session = await open(file, snapshotFile);
  await session.flush();
  const base = read(file);

  const peer = new LoroDoc();
  peer.import(session.snapshot());
  const editor = createDocumentHeadlessEditor();
  const binding = createLoroBinding(editor, peer);
  const from = peer.oplogVersion();
  editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, edited by hand'), {
    discrete: true,
  });
  session.importUpdate(peer.export({ mode: 'update', from }));
  binding.dispose();

  const agentText = base.replace('</doc>', '  <p>two</p>\n</doc>');
  fs.writeFileSync(file, agentText);
  session.onFileText(agentText);
  await session.flush();
  expect(read(file)).toContain('one, edited by hand');
  expect(read(file)).toContain('two</p>');
});

test('a rejected agent edit leaves the file alone until a valid one arrives', async () => {
  const { file, snapshotFile } = setup('<doc><p>one</p></doc>');
  const session = await open(file, snapshotFile);
  await session.flush();
  const broken = '<doc><p>one</h2></doc>';
  fs.writeFileSync(file, broken);
  session.onFileText(broken);
  await session.flush();
  expect(read(file)).toBe(broken);
  expect(session.outcome()).toEqual({ kind: 'rejected', message: '</h2> closes <p>' });

  const fixed = '<doc><p>one</p><p>fixed</p></doc>';
  fs.writeFileSync(file, fixed);
  session.onFileText(fixed);
  await session.flush();
  expect(read(file)).toContain('fixed</p>');
  expect(session.outcome().kind).toBe('merged');
});

test('streams agent edits as updates', async () => {
  const { file, snapshotFile } = setup('<doc><p>one</p></doc>');
  const session = await open(file, snapshotFile);
  await session.flush();
  const events: DocumentEvent[] = [];
  session.subscribe((event) => events.push(event));
  session.onFileText(read(file).replace('</doc>', '<p>two</p></doc>'));
  await session.flush();
  expect(events.some((event) => event.type === 'update')).toBe(true);
  expect(events.some((event) => event.type === 'status' && event.outcome.kind === 'merged')).toBe(
    true,
  );
});

test('queued section writes appear once and preserve a concurrent human edit', async () => {
  const { file, snapshotFile } = setup('<doc><p id="intro">one</p></doc>');
  const session = await open(file, snapshotFile, 1);
  await session.flush();
  const base = read(file);
  const first = base.replace('</doc>', '  <p id="second">two</p>\n</doc>');
  const second = first
    .replace('two</p>', 'two revised</p>')
    .replace('</doc>', '  <p id="third">three</p>\n</doc>');
  const third = second.replace('</doc>', '  <p id="fourth">four</p>\n</doc>');
  for (const text of [first, second, third]) {
    fs.writeFileSync(file, text);
    session.onFileText(text);
  }
  expect(session.streaming()).toBe(true);

  const peer = new LoroDoc();
  peer.import(session.snapshot());
  const editor = createDocumentHeadlessEditor();
  const binding = createLoroBinding(editor, peer);
  const from = peer.oplogVersion();
  editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, edited by hand'), {
    discrete: true,
  });
  session.importUpdate(peer.export({ mode: 'update', from }));
  binding.dispose();

  await session.flush();
  expect(read(file).match(/<p\b[^>]*>.*?<\/p>/g)).toEqual([
    '<p id="intro">one, edited by hand</p>',
    '<p id="second">two revised</p>',
    '<p id="third">three</p>',
    '<p id="fourth">four</p>',
  ]);
  expect(session.outcome().kind).toBe('merged');
  expect(session.streaming()).toBe(false);
  expect(session.cursor()).toBeNull();
});

test('reopens from the snapshot and takes a file written while it was closed', async () => {
  const { file, snapshotFile } = setup('<doc><p>one</p></doc>');
  const first = await open(file, snapshotFile);
  await first.flush();
  await first.close();
  sessions = [];
  expect(fs.existsSync(snapshotFile)).toBe(true);

  fs.writeFileSync(file, read(file).replace('</doc>', '<p>written offline</p></doc>'));
  const second = await open(file, snapshotFile);
  await second.flush();
  const xml = read(file);
  expect(xml).toContain('written offline');
  expect(xml.match(/one<\/p>/g)).toHaveLength(1);
});

test('an agent write from a copy older than the human edit does not revert it', async () => {
  const { file, snapshotFile } = setup('<doc><h2>Relay</h2><p>one</p></doc>');
  const session = await open(file, snapshotFile);
  await session.flush();
  const stale = read(file);

  const peer = new LoroDoc();
  peer.import(session.snapshot());
  const editor = createDocumentHeadlessEditor();
  const binding = createLoroBinding(editor, peer);
  const from = peer.oplogVersion();
  editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, edited by hand'), {
    discrete: true,
  });
  session.importUpdate(peer.export({ mode: 'update', from }));
  binding.dispose();
  await session.flush();
  expect(read(file)).toContain('one, edited by hand');

  const agentText = stale.replace('</doc>', '  <p>two</p>\n</doc>');
  fs.writeFileSync(file, agentText);
  session.onFileText(agentText);
  await session.flush();
  expect(read(file)).toContain('one, edited by hand');
  expect(read(file)).toContain('two</p>');
});

test('a pending block survives load and an agent edit that fills the section before it', async () => {
  const { file, snapshotFile } = setup(
    '<doc><h2 id="a">One</h2><pending id="p1" intent="first"/><h2 id="b">Two</h2><pending id="p2" intent="second"/></doc>',
  );
  const session = await open(file, snapshotFile);
  await session.flush();
  expect(read(file)).toContain('<pending id="p1" intent="first" />');
  const agentText = read(file).replace('<pending id="p1" intent="first" />', '<p>filled</p>');
  fs.writeFileSync(file, agentText);
  session.onFileText(agentText);
  await session.flush();
  expect(session.outcome().kind).toBe('merged');
  expect(read(file)).toContain('filled</p>');
  expect(read(file)).not.toContain('intent="first"');
  expect(read(file)).toContain('<pending id="p2" intent="second" />');
});

test('agent activity starts at the file time and moves only with agent writes', async () => {
  const { file, snapshotFile } = setup('<doc><p>one</p></doc>');
  const written = new Date(Date.now() - 60_000);
  fs.utimesSync(file, written, written);
  const session = await open(file, snapshotFile);
  await session.flush();
  expect(session.agentActiveAt()).toBe(written.getTime());

  const peer = new LoroDoc();
  peer.import(session.snapshot());
  const editor = createDocumentHeadlessEditor();
  const binding = createLoroBinding(editor, peer);
  const from = peer.oplogVersion();
  editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one by hand'), {
    discrete: true,
  });
  session.importUpdate(peer.export({ mode: 'update', from }));
  binding.dispose();
  await session.flush();
  expect(session.agentActiveAt()).toBe(written.getTime());

  const events: DocumentEvent[] = [];
  session.subscribe((event) => events.push(event));
  const before = Date.now();
  const broken = '<doc><p>one</h2></doc>';
  fs.writeFileSync(file, broken);
  session.onFileText(broken);
  expect(session.agentActiveAt()).toBeGreaterThanOrEqual(before);
  expect(
    events.some(
      (event) => event.type === 'status' && event.agentActiveAt === session.agentActiveAt(),
    ),
  ).toBe(true);
});

test('a client that cannot show pending blocks is refused instead of wiping the document', async () => {
  const { file, snapshotFile } = setup(
    '<doc><h2>One</h2><p>keep me</p><pending intent="first"/></doc>',
  );
  const session = await open(file, snapshotFile);
  await session.flush();

  const peer = new LoroDoc();
  const updates: Uint8Array[] = [];
  peer.subscribeLocalUpdates((bytes) => updates.push(bytes));
  const binding = createLoroBinding(
    createHeadlessEditor({ nodes: allHeadlessNodes, onError: () => {} }),
    peer,
  );
  binding.import(session.snapshot());
  binding.dispose();
  expect(updates.length).toBeGreaterThan(0);

  for (const update of updates)
    expect(() => session.importUpdate(update)).toThrow('reload the page');
  await session.flush();
  expect(read(file)).toContain('keep me');
  expect(read(file)).toContain('intent="first"');
});

test('a client that declares pending support edits a document that has pending blocks', async () => {
  const { file, snapshotFile } = setup('<doc><p>one</p><pending intent="first"/></doc>');
  const session = await open(file, snapshotFile);
  await session.flush();
  const peer = new LoroDoc();
  peer.import(session.snapshot());
  const editor = createDocumentHeadlessEditor();
  const binding = createLoroBinding(editor, peer);
  const from = peer.oplogVersion();
  editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one by hand'), {
    discrete: true,
  });
  session.importUpdate(peer.export({ mode: 'update', from }), ['pending']);
  binding.dispose();
  await session.flush();
  expect(read(file)).toContain('one by hand');
});

test('agent activity survives a restart even when a human autosave touched the file since', async () => {
  const { file, snapshotFile } = setup('<doc><p>one</p><pending intent="later"/></doc>');
  const first = await open(file, snapshotFile);
  await first.flush();
  const agentText = read(file).replace('</doc>', '  <p>two</p>\n</doc>');
  fs.writeFileSync(file, agentText);
  first.onFileText(agentText);
  await first.flush();
  const wrote = first.agentActiveAt();
  await first.close();
  sessions = sessions.filter((s) => s !== first);

  const later = new Date(Date.now() + 3_600_000);
  fs.utimesSync(file, later, later);
  const second = await open(file, snapshotFile);
  expect(second.agentActiveAt()).toBe(wrote);
});

test('an agent that replaces a large block with a small one removes the large block', async () => {
  const art = Array.from({ length: 12 }, (_, i) => `│ row ${i} │`).join('\n');
  const { file, snapshotFile } = setup('<doc><h2>Flow</h2><p>intro</p></doc>');
  const session = await open(file, snapshotFile);
  await session.flush();
  const withArt = read(file).replace(
    '</doc>',
    `  <codeblock id="flow" lang="text"><![CDATA[${art}]]></codeblock>\n</doc>`,
  );
  fs.writeFileSync(file, withArt);
  session.onFileText(withArt);
  await session.flush();
  const current = read(file);
  const replaced = current.replace(
    /<codeblock id="flow"[\s\S]*?<\/codeblock>/,
    '<mermaid id="flow"><![CDATA[flowchart TD\n  A --> B]]></mermaid>',
  );
  fs.writeFileSync(file, replaced);
  session.onFileText(replaced);
  await session.flush();
  expect(read(file)).not.toContain('row 0');
  expect(read(file)).toContain('<mermaid');
  expect(read(file).match(/<h2/g)).toHaveLength(1);
});

test('an agent that removes a block it added earlier removes it', async () => {
  const { file, snapshotFile } = setup('<doc><h2>Flow</h2><p>intro</p></doc>');
  const session = await open(file, snapshotFile);
  await session.flush();
  const before = read(file);
  const added = before.replace('</doc>', '  <p>temporary section</p>\n</doc>');
  fs.writeFileSync(file, added);
  session.onFileText(added);
  await session.flush();
  const removed = read(file).replace(/\s*<p id="[^"]+">temporary section<\/p>/, '');
  fs.writeFileSync(file, removed);
  session.onFileText(removed);
  await session.flush();
  expect(read(file)).not.toContain('temporary section');
});
