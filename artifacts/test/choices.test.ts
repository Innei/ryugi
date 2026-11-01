import { describe, expect, test } from 'vitest';

import {
  applyBoardHumanOp,
  type BoardAnchor,
  type BoardThread,
  emptyBoardComments,
  readBoardAnchor,
} from '../src/shared/board-comments';
import { groupChoice, isChoiceRecord, roundSubmission } from '../src/shared/choices';

let clock = 0;
const record = (
  anchor: Partial<BoardAnchor>,
  options: { author?: 'human' | 'agent'; deleted?: boolean } = {},
): BoardThread => {
  clock += 1;
  const at = `2026-11-01T08:00:${String(clock).padStart(2, '0')}.000Z`;
  return {
    id: `t${clock}`,
    anchor: { page: 'p', x: 0, y: 0, ...anchor },
    status: 'resolved',
    statusAt: at,
    messages: [
      {
        id: `m${clock}`,
        at,
        author: options.author ?? 'human',
        text: 'Choose',
        ...(options.deleted ? { deleted: true as const } : {}),
      },
    ],
  };
};

describe('groupChoice', () => {
  test('the latest choice in a group wins', () => {
    const threads = [
      record({ group: 'q1', choice: 'q1-a' }),
      record({ group: 'q2', choice: 'q2-a' }),
      record({ group: 'q1', choice: 'q1-c' }),
    ];
    expect(groupChoice(threads, 'q1', 'q1-b')).toMatchObject({
      choice: 'q1-c',
      byRecommendation: false,
      by: 'human',
    });
  });

  test('clearing falls back to the recommendation, and without one to no choice', () => {
    const threads = [
      record({ group: 'q1', choice: 'q1-a' }),
      record({ group: 'q1', choice: null }),
    ];
    expect(groupChoice(threads, 'q1', 'q1-b')).toMatchObject({
      choice: 'q1-b',
      byRecommendation: true,
    });
    expect(groupChoice(threads, 'q1')).toMatchObject({ choice: null, byRecommendation: false });
  });

  test('a deleted record does not count', () => {
    const threads = [
      record({ group: 'q1', choice: 'q1-a' }),
      record({ group: 'q1', choice: 'q1-c' }, { deleted: true }),
    ];
    expect(groupChoice(threads, 'q1').choice).toBe('q1-a');
  });
});

describe('roundSubmission', () => {
  test('a withdrawal after a submit leaves the round unsubmitted', () => {
    const submitted = [record({ round: 'r1', submit: true }, { author: 'agent' })];
    expect(roundSubmission(submitted, 'r1')).toMatchObject({ submitted: true, by: 'agent' });
    const withdrawn = [...submitted, record({ round: 'r1', submit: false })];
    expect(roundSubmission(withdrawn, 'r1')).toMatchObject({ submitted: false });
    expect(roundSubmission([], 'r1')).toEqual({ submitted: false });
  });
});

describe('choice records', () => {
  test('anchors need a group for a choice and a round for a submit', () => {
    expect(readBoardAnchor({ page: 'p', x: 0, y: 0, choice: 'q1-a' })).toBeNull();
    expect(readBoardAnchor({ page: 'p', x: 0, y: 0, submit: true })).toBeNull();
    expect(readBoardAnchor({ page: 'p', x: 0, y: 0, group: 'q1', choice: null })).toEqual({
      page: 'p',
      x: 0,
      y: 0,
      group: 'q1',
      choice: null,
    });
    expect(readBoardAnchor({ page: 'p', x: 0, y: 0, round: 'r1', submit: false })).toMatchObject({
      round: 'r1',
      submit: false,
    });
  });

  test('a human choice is stored resolved, so it never waits on the agent', () => {
    const file = applyBoardHumanOp(
      emptyBoardComments(),
      {
        op: 'create',
        anchor: { page: 'p', x: 0, y: 0, group: 'q1', choice: 'q1-a' },
        text: 'q1-a',
      },
      '2026-11-01T08:00:00.000Z',
      () => 'id',
    );
    expect(file.threads[0]).toMatchObject({ status: 'resolved' });
    expect(isChoiceRecord(file.threads[0]!)).toBe(true);
    expect(isChoiceRecord(record({ group: 'q1' }))).toBe(false);
  });
});
