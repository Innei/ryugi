import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { artifactSignature } from '../src/server/artifacts';
import { asBoardHumanOp, createBoardCommentRegistry } from '../src/server/board-comments';
import { packArtifact } from '../src/server/pack';
import type { ServerMessage } from '../src/shared/types';

function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-board-comments-'));
  const dir = path.join(root, 'artboard', 'review');
  fs.mkdirSync(path.join(dir, 'pages'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'canvas.json'),
    JSON.stringify({
      version: 1,
      pages: [{ id: 'p', name: 'P' }],
      boards: {
        a: { file: 'pages/a.html', page: 'p', x: 0, y: 0, w: 100, h: 100 },
        b: { file: 'pages/b.html', page: 'p', x: 200, y: 0, w: 100, h: 100 },
      },
    }),
  );
  fs.writeFileSync(path.join(dir, 'pages', 'a.html'), '<html><body><p>a</p></body></html>');
  fs.writeFileSync(path.join(dir, 'pages', 'b.html'), '<html><body><p>b</p></body></html>');
  const sent: ServerMessage[] = [];
  const registry = createBoardCommentRegistry({ root, stateDir: path.join(root, '.state'), broadcast: (m) => sent.push(m) });
  return { root, dir, sent, registry };
}

const create = (anchor: Record<string, unknown>, text = '开关没对齐') => asBoardHumanOp({ op: 'create', anchor, text })!;

test('a human comment on a node gets the hash of every board it touches', () => {
  const { registry } = project();
  const { comments } = registry.apply('review', create({ page: 'p', board: 'a', x: 10, y: 20, nodes: [{ board: 'a', path: 'body > p' }, { board: 'b', path: 'body > p' }] }));
  expect(Object.keys(comments.threads[0]!.anchor.hashes ?? {}).sort()).toEqual(['a', 'b']);
});

test('hashes sent by the page are replaced by the server', () => {
  const { registry } = project();
  const { comments } = registry.apply('review', create({ page: 'p', board: 'a', x: 1, y: 1, hashes: { a: 'forged' } }));
  expect(comments.threads[0]!.anchor.hashes?.a).not.toBe('forged');
});

test('a page comment has no hashes and never goes stale', () => {
  const { registry, dir } = project();
  registry.apply('review', create({ page: 'p', x: -50, y: 300 }));
  fs.writeFileSync(path.join(dir, 'pages', 'a.html'), '<html><body>changed</body></html>');
  registry.boardsChanged('review');
  expect(registry.stale('review')).toEqual([]);
});

test('rewriting a board file makes its threads stale and pushes the change once', () => {
  const { registry, dir, sent } = project();
  const { comments } = registry.apply('review', create({ page: 'p', board: 'a', x: 1, y: 1, nodes: [{ board: 'a', path: 'body > p' }] }));
  registry.apply('review', create({ page: 'p', board: 'b', x: 1, y: 1 }));
  sent.length = 0;
  fs.writeFileSync(path.join(dir, 'pages', 'a.html'), '<html><body><p>a2</p></body></html>');
  registry.boardsChanged('review');
  registry.boardsChanged('review');
  expect(registry.stale('review')).toEqual([comments.threads[0]!.id]);
  expect(sent).toEqual([{ type: 'board-comments', artifact: 'artboard/review', comments: registry.comments('review'), stale: [comments.threads[0]!.id] }]);
});

test('a board removed from canvas.json makes its threads stale', () => {
  const { registry, dir } = project();
  registry.apply('review', create({ page: 'p', board: 'b', x: 1, y: 1 }));
  const canvas = JSON.parse(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8'));
  delete canvas.boards.b;
  fs.writeFileSync(path.join(dir, 'canvas.json'), JSON.stringify(canvas));
  registry.boardsChanged('review');
  expect(registry.stale('review')).toHaveLength(1);
});

test('an agent hand-edit of comments.json is merged and pushed', () => {
  const { registry, dir, sent } = project();
  registry.comments('review');
  fs.writeFileSync(path.join(dir, 'comments.json'), JSON.stringify({ threads: [{ anchor: { page: 'p', board: 'a', x: 5, y: 5 }, messages: [{ author: 'agent', text: '这里？' }] }] }));
  registry.sync('review');
  expect(registry.comments('review').threads).toHaveLength(1);
  expect(sent.filter((m) => m.type === 'board-comments')).toHaveLength(1);
});

test('the agent list keeps its own cursor per artifact type', () => {
  const { registry, root } = project();
  registry.apply('review', create({ page: 'p', board: 'a', x: 1, y: 1 }));
  const first = registry.list('review', 'Codex', false);
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ stale: false, waitingOn: 'agent', files: { a: 'pages/a.html' } });
  expect(registry.list('review', 'Codex', false)).toEqual([]);
  expect(fs.existsSync(path.join(root, '.state', 'artboard', 'review', 'comment-cursors.json'))).toBe(true);
});

test('the agent can add a thread on a board and gets its hash stamped', () => {
  const { registry } = project();
  const { threadId } = registry.applyAgent('review', { op: 'add', anchor: { page: 'p', board: 'a', x: 100, y: 0 }, text: '不确定' }, 'Codex');
  expect(registry.comments('review').threads.find((t) => t.id === threadId)?.anchor.hashes?.a).toEqual(expect.any(String));
});

test('the page cannot send a malformed create', () => {
  expect(asBoardHumanOp({ op: 'create', anchor: { page: 'p' }, text: 'x' })).toBeNull();
  expect(asBoardHumanOp({ op: 'create', anchor: { page: 'p', x: 1, y: 1 }, text: '' })).toBeNull();
  expect(asBoardHumanOp({ op: 'reply', threadId: 't', text: 'ok' })).toEqual({ op: 'reply', threadId: 't', text: 'ok' });
});

test('artboard comments.json changes neither the artboard signature nor its publish pack', () => {
  const { dir } = project();
  const before = artifactSignature(dir, 'artboard');
  fs.writeFileSync(path.join(dir, 'comments.json'), JSON.stringify({ version: 1, threads: [] }));
  expect(artifactSignature(dir, 'artboard')).toBe(before);
  expect(packArtifact(dir, 'artboard').map((file) => file.path)).not.toContain('comments.json');
});
