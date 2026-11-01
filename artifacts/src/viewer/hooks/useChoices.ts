import { useMemo } from 'react';

import type { BoardHumanOp, BoardThread } from '../../shared/board-comments';
import { groupChoice, isChoiceRecord, roundSubmission } from '../../shared/choices';
import { choiceRounds, type RoundInfo, roundOfGroup } from '../../shared/rounds';
import type { CanvasLayout, CanvasSpec } from '../../shared/types';

export type RoundState = 'open' | 'submitted' | 'closed';

export interface BoardChoice {
  chosen: boolean;
  disabled: boolean;
  group: string;
  recommended: boolean;
}

export interface RoundSummary {
  byRecommendation: string[];
  chosen: number;
  comments: number;
  round: RoundInfo;
  state: Exclude<RoundState, 'closed'>;
  submittedAt?: string;
  total: number;
  unanswered: string[];
}

interface Options {
  canvas: CanvasSpec | null | undefined;
  comment?: (op: BoardHumanOp) => Promise<unknown>;
  layout: CanvasLayout | null | undefined;
  listening: boolean;
  page: string | null;
  threads: BoardThread[];
}

const stateOf = (round: RoundInfo, threads: BoardThread[]): RoundState =>
  round.closed ? 'closed' : roundSubmission(threads, round.id).submitted ? 'submitted' : 'open';

export function useChoices({ canvas, layout, page, threads, listening, comment }: Options) {
  const rounds = useMemo(
    () => (canvas && layout ? choiceRounds(canvas, layout) : []),
    [canvas, layout],
  );
  const groupOfBoard = useMemo(() => {
    const map = new Map<string, string>();
    for (const round of rounds)
      for (const group of round.groups)
        for (const board of canvas?.groups?.[group]?.boards ?? []) map.set(board, group);
    return map;
  }, [rounds, canvas]);

  const choices = useMemo(() => {
    const map = new Map<string, ReturnType<typeof groupChoice>>();
    for (const round of rounds)
      for (const group of round.groups)
        map.set(group, groupChoice(threads, group, canvas?.groups?.[group]?.recommend));
    return map;
  }, [rounds, threads, canvas]);

  const states = useMemo(
    () => new Map(rounds.map((round) => [round.id, stateOf(round, threads)])),
    [rounds, threads],
  );

  const chosenBoards = useMemo(() => {
    const set = new Set<string>();
    for (const round of rounds)
      for (const group of round.groups) {
        const found = choices.get(group);
        if (found?.choice && (!found.byRecommendation || states.get(round.id) !== 'open'))
          set.add(found.choice);
      }
    return set;
  }, [rounds, choices, states]);

  const current = useMemo<RoundSummary | null>(() => {
    const round = rounds.filter((r) => r.page === page && !r.closed).at(-1);
    if (!round) return null;
    const state = states.get(round.id);
    if (state !== 'open' && state !== 'submitted') return null;
    const boards = new Set(round.groups.flatMap((g) => canvas?.groups?.[g]?.boards ?? []));
    const groups = new Set(round.groups);
    const comments = threads.filter(
      (t) =>
        !isChoiceRecord(t) &&
        t.messages.some((m) => !m.deleted) &&
        ((t.anchor.board && boards.has(t.anchor.board)) ||
          (t.anchor.group && groups.has(t.anchor.group))),
    ).length;
    const picked = round.groups.map((g) => [g, choices.get(g)] as const);
    const submission = roundSubmission(threads, round.id);
    return {
      round,
      state,
      total: round.groups.length,
      chosen: picked.filter(([, c]) => c?.choice && !c.byRecommendation).length,
      byRecommendation: picked.filter(([, c]) => c?.byRecommendation).map(([g]) => g),
      unanswered: picked.filter(([, c]) => !c?.choice).map(([g]) => g),
      comments,
      ...(submission.submitted && submission.at ? { submittedAt: submission.at } : {}),
    };
  }, [rounds, page, states, canvas, threads, choices]);

  const send = (op: BoardHumanOp) => {
    if (comment) void comment(op).catch(() => {});
  };

  const boardChoice = (board: string): BoardChoice | null => {
    const group = groupOfBoard.get(board);
    if (!group) return null;
    const round = roundOfGroup(rounds, group);
    const found = choices.get(group);
    return {
      group,
      chosen: !!found?.choice && found.choice === board && !found.byRecommendation,
      recommended: canvas?.groups?.[group]?.recommend === board,
      disabled: !comment || !round || states.get(round.id) !== 'open',
    };
  };

  const choose = (board: string) => {
    const spec = canvas?.boards[board];
    const info = boardChoice(board);
    if (!spec || !info || info.disabled) return;
    const choice = info.chosen ? null : board;
    send({
      op: 'create',
      anchor: { page: spec.page, x: spec.x, y: spec.y, group: info.group, choice },
      text: choice ?? `Clear ${info.group}`,
    });
  };

  const submitRound = (submit: boolean) => {
    if (!current) return;
    send({
      op: 'create',
      anchor: { page: current.round.page, x: 0, y: 0, round: current.round.id, submit },
      text: `${submit ? 'Submit' : 'Withdraw'} ${current.round.id}`,
    });
  };

  return {
    active: rounds.length > 0,
    boardChoice,
    choose,
    chosenBoards,
    current,
    listening,
    canAct: !!comment,
    submit: () => submitRound(true),
    withdraw: () => submitRound(false),
    choiceOf: (group: string) => choices.get(group),
  };
}

export type Choices = ReturnType<typeof useChoices>;
