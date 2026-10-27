import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { createCommentStore } from '../src/server/document-comments';

const names = (agent: string) => ({ human: () => ({ name: 'innei' }), agent: () => agent });

function savedFile() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-store-')), 'comments.json');
  const store = createCommentStore(file, names('Codex'));
  const { threads } = store.apply({ op: 'create', blockId: 'b1', quote: '', text: 'why?' });
  const thread = threads[0]!;
  const withReply = JSON.parse(fs.readFileSync(file, 'utf8'));
  withReply.threads[0].messages.push({ author: 'agent', text: 'because' });
  fs.writeFileSync(file, JSON.stringify(withReply));
  store.sync();
  store.apply({ op: 'reply', threadId: thread.id, text: 'gone soon' });
  const last = store.current().threads[0]!.messages.at(-1)!;
  store.apply({ op: 'delete', threadId: thread.id, messageId: last.id });
  return { file, before: store.current() };
}

test('a restarted server keeps every saved message as it was, names included', () => {
  const { file, before } = savedFile();
  const restarted = createCommentStore(file, names('Claude Code'));
  expect(restarted.current()).toEqual(before);
  expect(
    restarted.current().threads[0]!.messages.map((m) => [m.author, m.name, m.deleted ?? false]),
  ).toEqual([
    ['human', 'innei', false],
    ['agent', 'Codex', false],
    ['human', 'innei', true],
  ]);
});

test('an agent reply written while the server was down is still filled in', () => {
  const { file } = savedFile();
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.threads[0].messages.push({ author: 'agent', text: 'later' });
  fs.writeFileSync(file, JSON.stringify(raw));
  const message = createCommentStore(file, names('Claude Code'))
    .current()
    .threads[0]!.messages.at(-1)!;
  expect(message).toMatchObject({
    author: 'agent',
    name: 'Claude Code',
    text: 'later',
    id: expect.any(String),
  });
});
