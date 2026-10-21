import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { asBoardAgentOp, asBoardHumanOp, createBoardCommentRegistry } from '../src/server/board-comments';

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-verdicts-'));
  const dir = path.join(root, 'artboard', 'review');
  fs.mkdirSync(path.join(dir, 'pages'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'canvas.json'),
    JSON.stringify({
      version: 1,
      pages: [{ id: 'p', name: 'P' }],
      boards: {
        design: { file: 'pages/design.html', page: 'p', x: 0, y: 0, w: 100, h: 100 },
        after: { type: 'image', src: 'pages/after.png', page: 'p', x: 200, y: 0, w: 100, h: 100 },
        other: { file: 'pages/other.html', page: 'p', x: 0, y: 400, w: 100, h: 100 },
      },
      groups: { notify: { title: '通知设置', boards: ['design', 'after'], verify: true }, plain: { boards: ['other'] } },
    }),
  );
  fs.writeFileSync(path.join(dir, 'pages', 'design.html'), '<html><body>design</body></html>');
  fs.writeFileSync(path.join(dir, 'pages', 'after.png'), 'png-1');
  fs.writeFileSync(path.join(dir, 'pages', 'other.html'), '<html><body>other</body></html>');
  const registry = createBoardCommentRegistry({ root, stateDir: path.join(root, '.state'), broadcast: () => {} });
  return { dir, registry };
}

const verdict = (group: string, kind: 'pass' | 'reject', text = kind === 'pass' ? '通过' : '字号小了一号') =>
  asBoardHumanOp({ op: 'create', anchor: { page: 'p', group, verdict: kind, x: 300, y: -20 }, text })!;

test('a reject is an open thread stamped with every board in the group, media included', () => {
  const { registry } = project();
  const { comments } = registry.apply('review', verdict('notify', 'reject'));
  const thread = comments.threads[0]!;
  expect(thread.status).toBe('open');
  expect(Object.keys(thread.anchor.hashes ?? {}).sort()).toEqual(['after', 'design']);
});

test('a pass is created resolved and closes the open rejects of its group', () => {
  const { registry } = project();
  registry.apply('review', verdict('notify', 'reject'));
  const { comments } = registry.apply('review', verdict('notify', 'pass'));
  expect(comments.threads.map((t) => [t.anchor.verdict, t.status])).toEqual([['reject', 'resolved'], ['pass', 'resolved']]);
});

test('a verdict needs a verify group', () => {
  const { registry } = project();
  expect(() => registry.apply('review', verdict('plain', 'pass'))).toThrow('no verify group plain in artboard/review');
  expect(() => registry.apply('review', verdict('missing', 'reject'))).toThrow('no verify group missing in artboard/review');
});

test('replacing the evidence makes the verdict stale', () => {
  const { registry, dir } = project();
  registry.apply('review', verdict('notify', 'reject'));
  fs.writeFileSync(path.join(dir, 'pages', 'after.png'), 'png-2');
  registry.boardsChanged('review');
  expect(registry.stale('review')).toHaveLength(1);
});

test('the agent cannot resolve a reject or create a verdict', () => {
  const { registry } = project();
  const { comments } = registry.apply('review', verdict('notify', 'reject'));
  expect(() => registry.applyAgent('review', { op: 'resolve', threadId: comments.threads[0]!.id })).toThrow('a reject closes only when your human partner passes the group');
  const add = asBoardAgentOp({ op: 'add', anchor: { page: 'p', group: 'notify', verdict: 'pass', x: 0, y: 0 }, text: '通过' })!;
  expect(add.op === 'add' && add.anchor.verdict).toBeFalsy();
});

test('list reports each verify group with its verdict', () => {
  const { registry, dir } = project();
  expect(registry.groups('review')).toEqual([{ id: 'notify', page: 'p', title: '通知设置', verdict: 'pending', evidenceUpdated: false, rejectThreads: 0, boards: ['design', 'after'] }]);
  registry.apply('review', verdict('notify', 'reject'));
  expect(registry.groups('review')[0]).toMatchObject({ verdict: 'reject', rejectThreads: 1 });
  fs.writeFileSync(path.join(dir, 'pages', 'after.png'), 'png-2');
  registry.boardsChanged('review');
  expect(registry.groups('review')[0]).toMatchObject({ verdict: 'pending', evidenceUpdated: true, rejectThreads: 1 });
});
