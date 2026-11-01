import fs from 'node:fs';
import path from 'node:path';

import type { BoardAnchor, BoardThread } from '../shared/board-comments';
import { groupChoice, isChoiceRecord, roundSubmission } from '../shared/choices';
import { computeLayout } from '../shared/geometry';
import { choiceRounds, type RoundInfo, roundOfGroup } from '../shared/rounds';
import type { CanvasSpec } from '../shared/types';

export type RoundState = 'open' | 'submitted' | 'closed';

export interface RoundView {
  boards: string[];
  groups: string[];
  id: string;
  page: string;
  state: RoundState;
  submitted?: string;
  title?: string;
}

export interface ChoiceContext {
  canvas: CanvasSpec | null;
  rounds: RoundInfo[];
}

export function choiceContext(dir: string): ChoiceContext {
  try {
    const canvas = JSON.parse(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8')) as CanvasSpec;
    if (!Array.isArray(canvas.pages) || typeof canvas.boards !== 'object' || !canvas.boards)
      return { canvas: null, rounds: [] };
    return { canvas, rounds: choiceRounds(canvas, computeLayout(canvas)) };
  } catch {
    return { canvas: null, rounds: [] };
  }
}

export function roundState(round: RoundInfo, threads: BoardThread[]): RoundState {
  if (round.closed) return 'closed';
  return roundSubmission(threads, round.id).submitted ? 'submitted' : 'open';
}

export function roundViews(context: ChoiceContext, threads: BoardThread[]): RoundView[] {
  return context.rounds.map((round) => {
    const submission = roundSubmission(threads, round.id);
    return {
      id: round.id,
      page: round.page,
      ...(round.title ? { title: round.title } : {}),
      state: roundState(round, threads),
      ...(submission.submitted && submission.at ? { submitted: submission.at } : {}),
      groups: round.groups,
      boards: round.groups.flatMap((group) => context.canvas?.groups?.[group]?.boards ?? []),
    };
  });
}

const groupsTouching = (context: ChoiceContext, anchor: BoardAnchor) => {
  const boards = new Set([
    ...(anchor.board ? [anchor.board] : []),
    ...(anchor.nodes ?? []).map((node) => node.board),
  ]);
  return Object.entries(context.canvas?.groups ?? {})
    .filter(([id, group]) => id === anchor.group || group.boards.some((b) => boards.has(b)))
    .map(([id]) => id);
};

export function isDraft(context: ChoiceContext, thread: BoardThread, threads: BoardThread[]) {
  if (isChoiceRecord(thread)) return false;
  return groupsTouching(context, thread.anchor).some((group) => {
    const round = roundOfGroup(context.rounds, group);
    return !!round && roundState(round, threads) === 'open';
  });
}

export function choiceGroups(context: ChoiceContext, threads: BoardThread[]) {
  return context.rounds.flatMap((round) =>
    round.groups.map((id) => {
      const group = context.canvas!.groups![id]!;
      const own = threads.filter(
        (thread) =>
          !isChoiceRecord(thread) &&
          thread.messages.some((m) => !m.deleted) &&
          groupsTouching(context, thread.anchor).includes(id),
      );
      return {
        id,
        kind: 'choose' as const,
        page: round.page,
        round: round.id,
        ...(group.title ? { title: group.title } : {}),
        ...(group.recommend ? { recommend: group.recommend } : {}),
        ...groupChoice(threads, id, group.recommend),
        threads: own.length,
        boards: group.boards,
      };
    }),
  );
}

function checkChoice(context: ChoiceContext, group: string, choice: string | null) {
  const spec = context.canvas?.groups?.[group];
  if (!spec?.choose) throw new Error(`${group} is not a choice group`);
  if (choice !== null && !spec.boards.includes(choice))
    throw new Error(`${choice} is not a board of ${group}`);
  const round = roundOfGroup(context.rounds, group);
  if (!round) throw new Error(`${group} is not on the canvas`);
  return round;
}

function findRound(context: ChoiceContext, id: string) {
  const round = context.rounds.find((r) => r.id === id);
  if (!round) throw new Error(`no round ${id} with choice groups`);
  return round;
}

export function checkHumanRecord(
  context: ChoiceContext,
  anchor: BoardAnchor,
  threads: BoardThread[],
) {
  if (anchor.choice !== undefined) {
    const round = checkChoice(context, anchor.group!, anchor.choice);
    const state = roundState(round, threads);
    if (state !== 'open') throw new Error(`round ${round.id} is ${state}`);
  }
  if (anchor.submit !== undefined) {
    const round = findRound(context, anchor.round!);
    if (round.closed) throw new Error(`round ${round.id} is closed`);
  }
}

export function agentChoiceAnchor(
  context: ChoiceContext,
  group: string,
  choice: string | null,
): BoardAnchor {
  const round = checkChoice(context, group, choice);
  if (round.closed) throw new Error(`round ${round.id} is closed`);
  return { page: round.page, x: 0, y: 0, group, choice };
}

export function agentSubmitAnchor(
  context: ChoiceContext,
  id: string,
  submit: boolean,
): BoardAnchor {
  const round = findRound(context, id);
  if (round.closed) throw new Error(`round ${round.id} is closed`);
  return { page: round.page, x: 0, y: 0, round: id, submit };
}
