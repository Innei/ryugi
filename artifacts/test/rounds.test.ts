import { describe, expect, test } from 'vitest';

import { computeLayout } from '../src/shared/geometry';
import { choiceRounds, roundOfGroup } from '../src/shared/rounds';
import type { CanvasSpec } from '../src/shared/types';

const board = (page: string, x: number, y: number) => ({
  file: `pages/${page}/b.html`,
  page,
  x,
  y,
  w: 400,
  h: 300,
});

const canvas = (extra: Partial<CanvasSpec> = {}): CanvasSpec => ({
  version: 1,
  pages: [
    { id: 'p', name: 'P' },
    { id: 'q', name: 'Q' },
  ],
  boards: {
    'q1-a': board('p', 0, 0),
    'q1-b': board('p', 480, 0),
    'q2-a': board('p', 0, 1000),
    'q3-a': board('p', 0, 2000),
    'q3-b': board('p', 480, 2000),
    'x-a': board('q', 0, 0),
  },
  groups: {
    q1: { title: 'One', boards: ['q1-a', 'q1-b'], choose: true, recommend: 'q1-b' },
    q2: { title: 'Two', boards: ['q2-a'] },
    q3: { title: 'Three', boards: ['q3-a', 'q3-b'], choose: true },
    x: { title: 'Loose', boards: ['x-a'], choose: true },
  },
  notes: {
    r1: { page: 'p', kind: 'title', x: 0, y: -400, text: 'Round 1' },
    r2: { page: 'p', kind: 'title', x: 0, y: 1600, text: 'Round 2' },
  },
  ...extra,
});

describe('choiceRounds', () => {
  test('groups choice groups under the nearest title note above them', () => {
    const spec = canvas();
    const rounds = choiceRounds(spec, computeLayout(spec));
    expect(rounds.map((r) => [r.id, r.page, r.title, r.groups, r.closed])).toEqual([
      ['r1', 'p', 'Round 1', ['q1'], true],
      ['r2', 'p', 'Round 2', ['q3'], false],
      ['page:q', 'q', null, ['x'], false],
    ]);
  });

  test('a round stays open while nothing is below it', () => {
    const spec = canvas({
      notes: { r1: { page: 'p', kind: 'title', x: 0, y: -400, text: 'Round 1' } },
    });
    const rounds = choiceRounds(spec, computeLayout(spec));
    expect(rounds.find((r) => r.id === 'r1')).toMatchObject({
      groups: ['q1', 'q3'],
      closed: false,
    });
  });

  test('a later round of plain groups still closes the one above', () => {
    const spec = canvas({
      groups: {
        q1: { title: 'One', boards: ['q1-a', 'q1-b'], choose: true },
        q3: { title: 'Three', boards: ['q3-a', 'q3-b'] },
      },
    });
    const rounds = choiceRounds(spec, computeLayout(spec));
    expect(rounds).toEqual([expect.objectContaining({ id: 'r1', groups: ['q1'], closed: true })]);
  });

  test('roundOfGroup finds the round holding a group', () => {
    const spec = canvas();
    const rounds = choiceRounds(spec, computeLayout(spec));
    expect(roundOfGroup(rounds, 'q3')?.id).toBe('r2');
    expect(roundOfGroup(rounds, 'q2')).toBeUndefined();
  });
});
