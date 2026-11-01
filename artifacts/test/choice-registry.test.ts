import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { asBoardHumanOp, createBoardCommentRegistry } from '../src/server/board-comments';

const box = (x: number, y: number) => ({ page: 'p', x, y, w: 400, h: 300 });

function project(extraNotes: Record<string, unknown> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-choices-'));
  const dir = path.join(root, 'artboard', 'pick');
  fs.mkdirSync(path.join(dir, 'pages'), { recursive: true });
  const boards = {
    'q1-a': { file: 'pages/q1-a.html', ...box(0, 0) },
    'q1-b': { file: 'pages/q1-b.html', ...box(480, 0) },
    'q2-a': { file: 'pages/q2-a.html', ...box(0, 600) },
    'q2-b': { file: 'pages/q2-b.html', ...box(480, 600) },
    'plain': { file: 'pages/plain.html', ...box(0, 1200) },
  };
  fs.writeFileSync(
    path.join(dir, 'canvas.json'),
    JSON.stringify({
      version: 1,
      title: 'Pick',
      pages: [{ id: 'p', name: 'P' }],
      boards,
      groups: {
        q1: { title: 'One', boards: ['q1-a', 'q1-b'], choose: true, recommend: 'q1-b' },
        q2: { title: 'Two', boards: ['q2-a', 'q2-b'], choose: true },
        plain: { boards: ['plain'] },
      },
      notes: {
        r1: { page: 'p', kind: 'title', x: 0, y: -400, text: 'Round 1' },
        ...extraNotes,
      },
    }),
  );
  for (const board of Object.keys(boards))
    fs.writeFileSync(
      path.join(dir, 'pages', `${board}.html`),
      `<html><body>${board}</body></html>`,
    );
  const stateDir = path.join(root, '.state');
  const registry = createBoardCommentRegistry({ root, stateDir, broadcast: () => {} });
  return { dir, registry, stateDir };
}

const human = (anchor: Record<string, unknown>, text = 'x') =>
  asBoardHumanOp({ op: 'create', anchor: { page: 'p', x: 0, y: 0, ...anchor }, text })!;

test('a human choice must name a board of a choice group', () => {
  const { registry } = project();
  expect(() => registry.apply('pick', human({ group: 'plain', choice: 'plain' }))).toThrow(
    /choice group/,
  );
  expect(() => registry.apply('pick', human({ group: 'q1', choice: 'q2-a' }))).toThrow(
    /not a board of q1/,
  );
  registry.apply('pick', human({ group: 'q1', choice: 'q1-a' }));
  expect(registry.groups('pick').find((g) => g.id === 'q1')).toMatchObject({
    kind: 'choose',
    round: 'r1',
    choice: 'q1-a',
    byRecommendation: false,
  });
});

test('an unpicked group reports its recommendation, or no choice without one', () => {
  const { registry } = project();
  const groups = registry.groups('pick');
  expect(groups.find((g) => g.id === 'q1')).toMatchObject({
    choice: 'q1-b',
    byRecommendation: true,
  });
  expect(groups.find((g) => g.id === 'q2')).toMatchObject({
    choice: null,
    byRecommendation: false,
  });
});

test('a submitted round refuses human choices but takes the agent recording terminal answers', () => {
  const { registry, stateDir } = project();
  registry.apply('pick', human({ round: 'r1', submit: true }));
  expect(() => registry.apply('pick', human({ group: 'q1', choice: 'q1-a' }))).toThrow(/submitted/);
  registry.agentChoose('pick', 'q1', 'q1-a', 'Claude');
  expect(registry.groups('pick').find((g) => g.id === 'q1')).toMatchObject({ choice: 'q1-a' });
  const file = JSON.parse(
    fs.readFileSync(path.join(stateDir, 'artboard', 'pick', 'rounds.json'), 'utf8'),
  );
  expect(file.rounds).toEqual([
    expect.objectContaining({
      id: 'r1',
      page: 'p',
      state: 'submitted',
      groups: ['q1', 'q2'],
      boards: ['q1-a', 'q1-b', 'q2-a', 'q2-b'],
    }),
  ]);
});

test('a closed round refuses both choices and submits', () => {
  const { registry } = project({
    r2: { page: 'p', kind: 'title', x: 0, y: 800, text: 'Round 2' },
  });
  expect(registry.rounds('pick')).toEqual([expect.objectContaining({ id: 'r1', state: 'closed' })]);
  expect(() => registry.apply('pick', human({ round: 'r1', submit: false }))).toThrow(/closed/);
  expect(() => registry.apply('pick', human({ group: 'q1', choice: 'q1-a' }))).toThrow(/closed/);
});

test('choice records stay out of comment lists, and comments in an open round are drafts', () => {
  const { registry } = project();
  registry.apply('pick', human({ group: 'q1', choice: 'q1-a' }));
  registry.apply('pick', human({ board: 'q1-a' }, 'title too long'));
  registry.apply('pick', human({ board: 'plain' }, 'unrelated'));
  const all = registry.list('pick', 'Claude', true);
  expect(all.map((t) => [t.messages[0]!.text, t.draft])).toEqual([
    ['title too long', true],
    ['unrelated', false],
  ]);
  registry.apply('pick', human({ round: 'r1', submit: true }));
  expect(registry.list('pick', 'Claude', true).map((t) => t.draft)).toEqual([false, false]);
});

test('choice records carry no board hashes, so editing a board never resets a choice', () => {
  const { registry } = project();
  const { comments } = registry.apply('pick', human({ group: 'q1', choice: 'q1-a' }));
  expect(comments.threads[0]!.anchor.hashes).toBeUndefined();
});
