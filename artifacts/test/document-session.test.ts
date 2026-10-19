import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoroBinding } from '@haklex/rich-collab-loro';
import { $getRoot, $isElementNode, $isTextNode, type LexicalNode, type TextNode } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { afterEach, expect, test } from 'vitest';
import { createDocumentHeadlessEditor } from '../src/server/document-headless';
import { createDocumentSession, type DocumentEvent, type DocumentSession } from '../src/server/document-session';

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

async function open(file: string, snapshotFile: string) {
  const session = await createDocumentSession({ file, snapshotFile, stepDelayMs: 0, writeDelayMs: 5 });
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
  const spec = '{"version":1,"type":"bar","x":"day","series":[{"key":"n"}],"data":[{"day":"10-09","n":14}]}';
  const { file, snapshotFile } = setup(`<doc><h2 id="h1">Relay</h2><chart id="c1"><![CDATA[${spec}]]></chart></doc>`);
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
  editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, edited by hand'), { discrete: true });
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
  expect(events.some((event) => event.type === 'status' && event.outcome.kind === 'merged')).toBe(true);
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
  editor.update(() => $findText($getRoot(), 'one')!.setTextContent('one, edited by hand'), { discrete: true });
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
