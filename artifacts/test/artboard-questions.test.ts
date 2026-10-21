import { describe, expect, test } from 'vitest';
import type { CanvasLayout, CanvasSpec } from '../src/shared/types';
import { openingQuestion, questionList, roundsOf, stepQuestion } from '../src/viewer/lib/questions';

const board = (page: string, x: number, y: number, title?: string) => ({ file: `pages/${page}/b.html`, page, x, y, w: 390, h: 844, ...(title ? { title } : {}) });

const canvas: CanvasSpec = {
  version: 1,
  pages: [{ id: 'p', name: 'Phone' }, { id: 'q', name: 'Other' }],
  boards: {
    'q1-a': board('p', 0, 0),
    'q1-b': board('p', 470, 0),
    'q2-a': board('p', 0, 1100),
    'q1r2-a': board('p', 0, 2500),
    'q2r2-a': board('p', 1000, 2500),
    'q3r2-a': board('p', 0, 3600),
    loose: board('p', 2000, 2500, 'A board on its own'),
    'other-a': board('q', 0, 0),
  },
  groups: {
    q1: { title: '评论放在哪里', boards: ['q1-a', 'q1-b'] },
    q2: { title: '怎么开始', boards: ['q2-a'] },
    q1r2: { title: '无卡片', boards: ['q1r2-a'] },
    q2r2: { title: '右边那个', boards: ['q2r2-a'] },
    q3r2: { title: '下面那个', boards: ['q3r2-a'] },
    other: { title: '另一页', boards: ['other-a'] },
  },
  notes: {
    r1: { page: 'p', kind: 'title', x: 0, y: -340, text: '第 1 轮' },
    r2: { page: 'p', kind: 'title', x: 0, y: 2100, text: '第 2 轮' },
    hint: { page: 'p', kind: 'sticky', x: 1500, y: 0, text: 'a sticky is not a round' },
  },
};

const layout: CanvasLayout = {
  pages: {
    p: {
      groups: {
        q1: { x: -48, y: -144, w: 956, h: 1036 },
        q2: { x: -48, y: 956, w: 486, h: 1036 },
        q1r2: { x: -48, y: 2356, w: 486, h: 1036 },
        q2r2: { x: 952, y: 2356, w: 486, h: 1036 },
        q3r2: { x: -48, y: 3456, w: 486, h: 1036 },
      },
      notes: { r1: { x: 0, y: -340, w: 400, h: 110 }, r2: { x: 0, y: 2100, w: 400, h: 110 }, hint: { x: 1500, y: 0, w: 240, h: 80 } },
      bounds: { minX: -48, minY: -340, maxX: 2390, maxY: 4492 },
    },
    q: { groups: { other: { x: -48, y: -144, w: 486, h: 1036 } }, notes: {}, bounds: null },
  },
};

describe('rounds', () => {
  test('each question belongs to the title above it, newest round first, read top to bottom then left to right', () => {
    const rounds = roundsOf(canvas, layout, 'p');
    expect(rounds.map((round) => [round.title, round.questions.map((q) => q.id)])).toEqual([
      ['第 2 轮', ['q1r2', 'q2r2', 'loose', 'q3r2']],
      ['第 1 轮', ['q1', 'q2']],
    ]);
  });

  test('a question carries its title, boards and where it sits', () => {
    const [newest] = roundsOf(canvas, layout, 'p');
    expect(newest!.questions[0]).toEqual({ id: 'q1r2', title: '无卡片', boards: ['q1r2-a'], bounds: { minX: -48, minY: 2356, maxX: 438, maxY: 3392 } });
  });

  test('a board outside every group is a question of its own, titled by the board', () => {
    const loose = questionList(roundsOf(canvas, layout, 'p')).find((q) => q.id === 'loose');
    expect(loose).toMatchObject({ title: 'A board on its own', boards: ['loose'] });
  });

  test('questions with no title above them come last under 其他', () => {
    const rounds = roundsOf(canvas, layout, 'q');
    expect(rounds).toEqual([{ id: null, title: '其他', questions: [expect.objectContaining({ id: 'other' })] }]);
  });
});

describe('opening question and stepping', () => {
  const rounds = roundsOf(canvas, layout, 'p');
  const list = questionList(rounds);

  test('opens on the focused group, or the group holding the focused board', () => {
    expect(openingQuestion(rounds, 'q2')?.id).toBe('q2');
    expect(openingQuestion(rounds, 'q1-b')?.id).toBe('q1');
    expect(openingQuestion(rounds, 'loose')?.id).toBe('loose');
  });

  test('a focused round title opens on that round’s first question', () => {
    expect(openingQuestion(rounds, 'r1')?.id).toBe('q1');
  });

  test('without a usable focus it opens on the first question of the newest round', () => {
    expect(openingQuestion(rounds, undefined)?.id).toBe('q1r2');
    expect(openingQuestion(rounds, 'hint')?.id).toBe('q1r2');
    expect(openingQuestion(rounds, 'missing')?.id).toBe('q1r2');
  });

  test('previous and next follow the list and stop at its ends', () => {
    expect(list.map((q) => q.id)).toEqual(['q1r2', 'q2r2', 'loose', 'q3r2', 'q1', 'q2']);
    expect(stepQuestion(list, 'q2r2', 1)?.id).toBe('loose');
    expect(stepQuestion(list, 'q2r2', -1)?.id).toBe('q1r2');
    expect(stepQuestion(list, 'q1r2', -1)).toBeNull();
    expect(stepQuestion(list, 'q2', 1)).toBeNull();
  });

  test('a page without groups or boards has no questions', () => {
    const empty: CanvasSpec = { version: 1, pages: [{ id: 'p', name: 'P' }], boards: {} };
    expect(roundsOf(empty, { pages: { p: { groups: {}, notes: {}, bounds: null } } }, 'p')).toEqual([]);
    expect(openingQuestion([], undefined)).toBeNull();
  });
});
