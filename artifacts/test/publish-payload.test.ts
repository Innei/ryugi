import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { publishPayload } from '../src/server/publish-payload';
import type { CommentsFile } from '../src/shared/comments';

const comments: CommentsFile = {
  version: 1,
  threads: [
    {
      id: 't1',
      anchor: { blockId: 'b1', quote: '事件' },
      status: 'open',
      statusAt: '2026-10-21T08:00:00.000Z',
      statusBy: 'human',
      messages: [
        {
          id: 'm1',
          author: 'human',
          name: 'innei',
          avatar: '/api/avatar/gravatar/abc',
          text: 'why?',
          at: '2026-10-21T08:00:00.000Z',
        },
        {
          id: 'm2',
          author: 'agent',
          name: 'Codex',
          text: 'because',
          at: '2026-10-21T08:01:00.000Z',
        },
      ],
    },
    {
      id: 't2',
      anchor: { blockId: 'b1', quote: '' },
      status: 'open',
      statusAt: '2026-10-21T08:00:00.000Z',
      messages: [
        {
          id: 'm3',
          author: 'human',
          text: '',
          deleted: true,
          at: '2026-10-21T08:00:00.000Z',
          editedAt: '2026-10-21T08:02:00.000Z',
        },
      ],
    },
  ],
};

function documentDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-publish-doc-'));
  fs.writeFileSync(
    path.join(dir, 'doc.xml'),
    '<doc><h1 id="b0">Title</h1><p id="b1">按事件粒度推送</p></doc>',
  );
  return dir;
}

test('a published document carries its comments without avatars or fully deleted threads', () => {
  const payload = publishPayload(
    { type: 'document', id: 'relay' },
    documentDir(),
    'Title',
    null,
    comments,
  ) as { comments: CommentsFile };
  expect(payload.comments.threads.map((t) => t.id)).toEqual(['t1']);
  expect(payload.comments.threads[0]!.messages.map((m) => [m.name, 'avatar' in m])).toEqual([
    ['innei', false],
    ['Codex', false],
  ]);
});

test('a document published without comments carries an empty comment file', () => {
  const payload = publishPayload(
    { type: 'document', id: 'relay' },
    documentDir(),
    'Title',
    null,
  ) as { comments: CommentsFile };
  expect(payload.comments).toEqual({ version: 1, threads: [] });
});

test('a published artboard says its boards report ready and capture snapshots', () => {
  const payload = {
    canvas: { title: 'Board' },
    layout: null,
    versions: { 'pages/a.html': 1 },
    pending: [],
    warnings: [],
  };
  expect(publishPayload({ type: 'artboard', id: 'ideas' }, '/nowhere', 'Board', payload)).toEqual({
    canvas: { title: 'Board' },
    layout: null,
    versions: { 'pages/a.html': 1 },
    snapshots: true,
  });
});
