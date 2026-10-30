import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { asHumanOp, createCommentStore } from '../src/server/document-comments';

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

test('a comment on several blocks keeps its complete target after restarting', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-store-')), 'comments.json');
  const op = asHumanOp({
    op: 'create',
    blockId: 'b1',
    blockIds: ['b1', 'b3'],
    quote: '',
    text: 'Discuss these together',
  });
  expect(op).not.toBeNull();
  createCommentStore(file).apply(op!);
  const [thread] = createCommentStore(file).current().threads;
  expect(thread!.anchor).toEqual({ blockId: 'b1', blockIds: ['b1', 'b3'], quote: '' });
});

test('different multi-block targets do not merge when an agent writes id-less comments', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-store-')), 'comments.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      threads: [
        {
          anchor: { blockId: 'b1', blockIds: ['b1', 'b2'], quote: '' },
          messages: [{ text: 'Together' }],
        },
        {
          anchor: { blockId: 'b1', blockIds: ['b1', 'b3'], quote: '' },
          messages: [{ text: 'Together' }],
        },
      ],
    }),
  );
  const store = createCommentStore(file);
  expect(store.current().threads).toHaveLength(2);
  expect(createCommentStore(file).current().threads).toHaveLength(2);
});

test('cross-paragraph text anchors survive server validation and restarting', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-store-')), 'comments.json');
  const anchor = {
    blockId: 'b1',
    blockIds: ['b1', 'b2'],
    quote: 'rst\nUns',
    textRanges: [
      { blockId: 'b1', start: 2, quote: 'rst' },
      { blockId: 'b2', start: 0, quote: 'Uns' },
    ],
  };
  const op = asHumanOp({ op: 'create', ...anchor, text: 'Across paragraphs' });
  expect(op).not.toBeNull();
  createCommentStore(file).apply(op!);
  expect(createCommentStore(file).current().threads[0]!.anchor).toEqual(anchor);
});

test('comments on repeated text at different offsets are separate discussions', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-store-')), 'comments.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      threads: [0, 5].map((start) => ({
        anchor: {
          blockId: 'b1',
          blockIds: ['b1', 'b2'],
          quote: 'same\nend',
          textRanges: [
            { blockId: 'b1', quote: 'same', start },
            { blockId: 'b2', quote: 'end', start: 0 },
          ],
        },
        messages: [{ text: 'Discuss' }],
      })),
    }),
  );
  expect(createCommentStore(file).current().threads).toHaveLength(2);
});

test.each(
  [
    [
      { blockId: 'b1', start: -1, quote: 'rst' },
      { blockId: 'b2', start: 0, quote: 'Uns' },
    ],
    [
      { blockId: 'b1', start: 1.5, quote: 'rst' },
      { blockId: 'b2', start: 0, quote: 'Uns' },
    ],
    [
      { blockId: 'b1', start: 2, quote: 42 },
      { blockId: 'b2', start: 0, quote: 'Uns' },
    ],
    [{ blockId: 'b1', start: 2, quote: 'rst' }],
  ].map((textRanges) => ({ textRanges })),
)('rejects invalid text ranges rather than degrading to whole blocks: %j', ({ textRanges }) => {
  expect(
    asHumanOp({
      op: 'create',
      blockId: 'b1',
      blockIds: ['b1', 'b2'],
      quote: 'rst\nUns',
      textRanges,
      text: 'Comment',
    }),
  ).toBeNull();
});

test.each([[], ['other', 'b1'], ['b1', 'b1'], ['b1', 42], ['b1', '']])(
  'rejects a malformed multi-block target %j instead of silently commenting only the first block',
  (...blockIds) => {
    expect(
      asHumanOp({ op: 'create', blockId: 'b1', blockIds, quote: '', text: 'Comment' }),
    ).toBeNull();
  },
);
