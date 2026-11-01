import type { BoardThread } from './board-comments';

export { isChoiceRecord } from './board-comments';

export interface GroupChoice {
  at?: string;
  by?: 'human' | 'agent';
  byRecommendation: boolean;
  choice: string | null;
}

export interface RoundSubmission {
  at?: string;
  by?: 'human' | 'agent';
  submitted: boolean;
}

const live = (thread: BoardThread) => thread.messages.find((m) => !m.deleted);

function latest(threads: BoardThread[], match: (thread: BoardThread) => boolean) {
  let found: { thread: BoardThread; at: string; by: 'human' | 'agent' } | undefined;
  for (const thread of threads) {
    const message = live(thread);
    if (!message || !match(thread)) continue;
    if (!found || message.at >= found.at)
      found = { thread, at: message.at, by: message.author === 'agent' ? 'agent' : 'human' };
  }
  return found;
}

export function groupChoice(
  threads: BoardThread[],
  group: string,
  recommend?: string,
): GroupChoice {
  const found = latest(threads, (t) => t.anchor.group === group && t.anchor.choice !== undefined);
  const choice = found?.thread.anchor.choice ?? null;
  if (choice) return { choice, byRecommendation: false, at: found!.at, by: found!.by };
  const stamp = found ? { at: found.at, by: found.by } : {};
  return recommend
    ? { choice: recommend, byRecommendation: true, ...stamp }
    : { choice: null, byRecommendation: false, ...stamp };
}

export function roundSubmission(threads: BoardThread[], round: string): RoundSubmission {
  const found = latest(threads, (t) => t.anchor.round === round && t.anchor.submit !== undefined);
  if (!found) return { submitted: false };
  return { submitted: found.thread.anchor.submit === true, at: found.at, by: found.by };
}
