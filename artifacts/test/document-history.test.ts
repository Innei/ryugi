import { createLoroBinding } from '@haklex/rich-collab-loro';
import { allHeadlessNodes } from '@haklex/rich-headless';
import { createHeadlessEditor } from '@lexical/headless';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { expect, test } from 'vitest';
import { blockAuthors, readHistory, readHistoryState } from '../src/viewer/document/history';

test('a selected causal prefix includes earlier edits from other peers', async () => {
  const doc = new LoroDoc();
  doc.setPeerId('1');
  doc.getMap('data').set('base', true);
  doc.commit({ timestamp: 100, message: 'session start' });
  const other = doc.fork();
  other.setPeerId('2');
  doc.getMap('data').set('human', 'kept');
  doc.commit({ timestamp: 200, message: 'human' });
  other.getMap('data').set('agent', 'kept too');
  other.commit({ timestamp: 200, message: 'agent: edit' });
  doc.import(other.export({ mode: 'snapshot' }));
  const before = doc.frontiers();
  const history = await readHistory(doc);
  expect(history.entries).toHaveLength(3);
  const middle = doc.forkAt(history.entries[1]!.frontiers);
  expect(middle.getMap('data').toJSON()).toEqual({ base: true, human: 'kept' });
  middle.free();
  const selected = doc.forkAt(history.entries[2]!.frontiers);
  expect(selected.getMap('data').toJSON()).toEqual({
    base: true,
    human: 'kept',
    agent: 'kept too',
  });
  expect(doc.frontiers()).toEqual(before);
  selected.free();
  other.free();
  doc.free();
});

test('continuous edits group at 60 seconds, but not across gaps or unknown sources', async () => {
  const doc = new LoroDoc();
  doc.setChangeMergeInterval(0);
  for (const [timestamp, message] of [
    [100, 'human'],
    [160, 'human'],
    [221, 'human'],
    [222, 'unknown'],
    [223, 'unknown'],
  ] as const) {
    doc.getText('text').insert(0, '.');
    doc.commit({ timestamp, message });
  }
  const history = await readHistory(doc);
  expect(history.groups.map((group) => group.entries.length)).toEqual([1, 1, 1, 2]);
  expect(history.groups.map((group) => group.source)).toEqual([
    'unknown',
    'unknown',
    'human',
    'human',
  ]);
  doc.free();
});

test('missing timestamps remain selectable instead of becoming today', async () => {
  const doc = new LoroDoc();
  doc.getText('text').insert(0, 'first');
  doc.commit({ timestamp: 0, message: 'human' });
  const history = await readHistory(doc);
  expect(history.entries[0]!.change.timestamp).toBe(0);
  expect(history.groups).toHaveLength(1);
  const fork = doc.forkAt(history.entries[0]!.frontiers);
  expect(fork.getText('text').toString()).toBe('first');
  fork.free();
  doc.free();
});

test('materializing old rich content never adds operations to the live document', async () => {
  const doc = new LoroDoc();
  doc.setChangeMergeInterval(0);
  const editor = createHeadlessEditor({ nodes: allHeadlessNodes });
  const binding = createLoroBinding(editor, doc, { commitMessage: 'human' });
  editor.update(() => $getRoot().append($createParagraphNode().append($createTextNode('before'))), {
    discrete: true,
  });
  const old = doc.frontiers();
  editor.update(() => $getRoot().getAllTextNodes()[0]!.setTextContent('after'), { discrete: true });
  const current = doc.frontiers();
  const count = doc.opCount();
  const state = readHistoryState(doc, old, allHeadlessNodes).value;
  expect(JSON.stringify(state)).toContain('before');
  expect(JSON.stringify(state)).not.toContain('after');
  expect(doc.frontiers()).toEqual(current);
  expect(doc.opCount()).toBe(count);
  binding.dispose();
  doc.free();
});

test('retained versions in a shallow snapshot can be projected without touching the live document', async () => {
  const doc = new LoroDoc();
  doc.setChangeMergeInterval(0);
  const editor = createHeadlessEditor({ nodes: allHeadlessNodes });
  const binding = createLoroBinding(editor, doc, { commitMessage: 'human' });
  editor.update(
    () => $getRoot().append($createParagraphNode().append($createTextNode('retained boundary'))),
    { discrete: true },
  );
  const boundary = doc.frontiers();
  editor.update(() => $getRoot().getAllTextNodes()[0]!.setTextContent('retained latest'), {
    discrete: true,
  });
  const shallow = new LoroDoc();
  shallow.import(doc.export({ mode: 'shallow-snapshot', frontiers: boundary }));
  const before = shallow.frontiers();
  const count = shallow.opCount();
  const history = await readHistory(shallow);
  expect(history.shallow).toBe(true);
  expect(JSON.stringify(readHistoryState(shallow, boundary, allHeadlessNodes).value)).toContain(
    'retained boundary',
  );
  expect(
    JSON.stringify(readHistoryState(shallow, shallow.frontiers(), allHeadlessNodes).value),
  ).toContain('retained latest');
  expect(shallow.frontiers()).toEqual(before);
  expect(shallow.opCount()).toBe(count);
  binding.dispose();
  shallow.free();
  doc.free();
});

function authored() {
  const doc = new LoroDoc();
  doc.setChangeMergeInterval(0);
  const editor = createHeadlessEditor({ nodes: allHeadlessNodes });
  const binding = createLoroBinding(editor, doc);
  const edit = (timestamp: number, message: string, change: () => void) => {
    doc.setNextCommitOptions({ timestamp, message });
    editor.update(change, { discrete: true });
  };
  edit(100, 'session start', () =>
    $getRoot().append(
      ...['one', 'two', 'three'].map((text) =>
        $createParagraphNode().append($createTextNode(text)),
      ),
    ),
  );
  return {
    doc,
    edit,
    dispose: () => {
      binding.dispose();
      doc.free();
    },
  };
}

async function compare(doc: LoroDoc) {
  const history = await readHistory(doc);
  const start = history.entries.findIndex((entry) => entry.change.message === 'session start');
  const before = readHistoryState(doc, history.entries[start]!.frontiers, allHeadlessNodes);
  const after = readHistoryState(doc, doc.frontiers(), allHeadlessNodes);
  const authors = blockAuthors(doc, history.entries.slice(start + 1), [before, after]);
  return { before, after, authors };
}

test('each changed block is attributed to the edit that changed it', async () => {
  const { doc, edit, dispose } = authored();
  edit(200, 'human', () => $getRoot().getAllTextNodes()[0]!.setTextContent('one, revised'));
  edit(300, 'agent:claude-code', () => $getRoot().getChildren()[1]!.remove());
  edit(400, 'human', () =>
    $getRoot().append($createParagraphNode().append($createTextNode('four'))),
  );
  const { before, after, authors } = await compare(doc);
  expect(before.ids).toHaveLength(3);
  expect(after.ids).toHaveLength(3);
  expect(authors.get(before.ids[0]!)?.change.timestamp).toBe(200);
  expect(authors.get(before.ids[1]!)?.change.message).toBe('agent:claude-code');
  expect(authors.get(after.ids[2]!)?.change.timestamp).toBe(400);
  expect(authors.has(before.ids[2]!)).toBe(false);
  dispose();
});

test('a block edited twice is attributed to its newest edit', async () => {
  const { doc, edit, dispose } = authored();
  edit(200, 'human', () => $getRoot().getAllTextNodes()[0]!.setTextContent('one, revised'));
  edit(300, 'agent:claude-code', () =>
    $getRoot().getAllTextNodes()[0]!.setTextContent('one, revised again'),
  );
  const { before, authors } = await compare(doc);
  expect(authors.get(before.ids[0]!)?.change.timestamp).toBe(300);
  dispose();
});
