import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { detectAgent } from '../src/server/agent';
import { applyBoardHumanOp, emptyBoardComments } from '../src/shared/board-comments';
import { isChoiceRecord } from '../src/shared/choices';
import {
  applyHumanOp,
  type CommentsFile,
  emptyComments,
  mergeComments,
  unreadThreads,
} from '../src/shared/comments';

const hook = createRequire(import.meta.url)(
  path.resolve(__dirname, '../../hooks/selection-context.cjs'),
) as {
  unreadThreadCount: (file: CommentsFile, cursor: string | null) => number;
  cursorKey: (env: Record<string, string | undefined>) => string;
  commentReminders: (project: string, root: string, key: string) => string;
};

let counter = 0;
const ids = () => `id${++counter}`;
const at = (minute: number) => `2026-10-21T10:${String(minute).padStart(2, '0')}:00.000Z`;

function fixtures(): CommentsFile[] {
  const created = applyHumanOp(
    emptyComments(),
    { op: 'create', blockId: 'b1', quote: '', text: 'why?' },
    at(1),
    ids,
  );
  const threadId = created.threads[0]!.id;
  const reply = structuredClone(created) as unknown as { threads: { messages: unknown[] }[] };
  reply.threads[0]!.messages.push({ author: 'agent', text: 'because' });
  const answered = mergeComments(created, reply as never, 'agent', at(2), ids).file;
  const followed = applyHumanOp(answered, { op: 'reply', threadId, text: 'and?' }, at(3), ids);
  const edited = applyHumanOp(
    followed,
    { op: 'edit', threadId, messageId: followed.threads[0]!.messages[0]!.id, text: 'why??' },
    at(4),
    ids,
  );
  const deleted = applyHumanOp(
    edited,
    { op: 'delete', threadId, messageId: edited.threads[0]!.messages[2]!.id },
    at(5),
    ids,
  );
  const resolved = applyHumanOp(deleted, { op: 'resolve', threadId }, at(6), ids);
  const byAgent = structuredClone(resolved);
  byAgent.threads[0]!.status = 'open';
  const reopenedByAgent = mergeComments(resolved, byAgent, 'agent', at(7), ids).file;
  const legacy: CommentsFile = {
    version: 1,
    threads: resolved.threads.map(({ statusBy: _statusBy, ...thread }) => ({
      ...thread,
      statusAt: at(8),
    })),
  };
  const agentThread = mergeComments(
    emptyComments(),
    {
      threads: [
        { anchor: { blockId: 'b2', quote: '' }, messages: [{ author: 'agent', text: 'q' }] },
      ],
    } as never,
    'agent',
    at(9),
    ids,
  ).file;
  return [
    created,
    answered,
    followed,
    edited,
    deleted,
    resolved,
    reopenedByAgent,
    legacy,
    agentThread,
    { version: 1, threads: [...followed.threads, ...agentThread.threads] },
  ];
}

test('the hook counts the same unread threads as the server for every cursor', () => {
  const cursors = [null, ...Array.from({ length: 10 }, (_, i) => at(i))];
  for (const file of fixtures()) {
    for (const cursor of cursors)
      expect([cursor, hook.unreadThreadCount(file, cursor)]).toEqual([
        cursor,
        unreadThreads(file, cursor).threads.length,
      ]);
  }
});

test('choice and submit records never count as unread, matching what comment list returns', () => {
  const point = { page: 'p', x: 0, y: 0 };
  let file = applyBoardHumanOp(
    emptyBoardComments(),
    { op: 'create', anchor: { ...point, board: 'q1-a' }, text: 'too long' },
    at(3),
    ids,
  );
  file = applyBoardHumanOp(
    file,
    { op: 'create', anchor: { ...point, group: 'q1', choice: 'q1-a' }, text: 'q1-a' },
    at(4),
    ids,
  );
  file = applyBoardHumanOp(
    file,
    { op: 'create', anchor: { ...point, round: 'r1', submit: true }, text: 'Submit r1' },
    at(5),
    ids,
  );
  for (const cursor of [null, at(1), at(3), at(4)])
    expect([cursor, hook.unreadThreadCount(file as never, cursor)]).toEqual([
      cursor,
      unreadThreads(file, cursor).threads.filter((t) => !isChoiceRecord(t)).length,
    ]);
});

test('the hook reads the cursor the CLI writes for the same harness', () => {
  for (const env of [{ CLAUDECODE: '1' }, { CLAUDECODE: '1', CLAUDE_CODE_IS_COWORK: '1' }])
    expect(hook.cursorKey(env)).toBe(detectAgent(env));
});

test('the reminder names artboards with comments waiting on the agent', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-hook-'));
  const root = path.join(project, '.ryugi', 'artifacts');
  const write = (file: string, value: unknown) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  };
  write(
    path.join(root, 'artboard', 'review', 'comments.json'),
    applyBoardHumanOp(
      emptyBoardComments(),
      { op: 'create', anchor: { page: 'p', board: 'a', x: 1, y: 1 }, text: '没对齐' },
      at(1),
      ids,
    ),
  );
  const alone = hook.commentReminders(project, root, 'Claude Code');
  expect(alone).toContain('artboard/review (1)');
  expect(alone).toContain('--artifact artboard/review`');
  write(
    path.join(root, 'document', 'plan', 'comments.json'),
    applyHumanOp(
      emptyComments(),
      { op: 'create', blockId: 'b1', quote: '', text: 'why?' },
      at(2),
      ids,
    ),
  );
  const both = hook.commentReminders(project, root, 'Claude Code');
  expect(both).toContain('artboard/review (1)');
  expect(both).toContain('document/plan (1)');
  expect(both).toContain('--artifact <type>/<id>');
  write(path.join(root, '.state', 'artboard', 'review', 'comment-cursors.json'), {
    'Claude Code': at(5),
  });
  expect(hook.commentReminders(project, root, 'Claude Code')).not.toContain('artboard/review');
});
