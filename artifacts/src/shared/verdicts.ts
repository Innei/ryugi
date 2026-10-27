import type { BoardThread } from './board-comments';
import type { GroupSpec } from './types';

export type VerdictState = 'pending' | 'pass' | 'reject';

export interface GroupVerdict {
  at?: string;
  evidenceUpdated: boolean;
  rejectThreads: number;
  state: VerdictState;
}

export interface VerdictProgress {
  next?: string;
  passed: number;
  total: number;
}

const openedAt = (thread: BoardThread) => thread.messages[0]?.at ?? thread.statusAt;

export const isPassThread = (thread: BoardThread) => thread.anchor.verdict === 'pass';

export function groupVerdict(
  threads: BoardThread[],
  group: string,
  stale: ReadonlySet<string>,
): GroupVerdict {
  const own = threads
    .filter(
      (thread) =>
        thread.anchor.group === group &&
        thread.anchor.verdict &&
        thread.messages.some((m) => !m.deleted),
    )
    .sort((a, b) => (openedAt(a) < openedAt(b) ? -1 : openedAt(a) > openedAt(b) ? 1 : 0));
  const rejectThreads = own.filter(
    (thread) => thread.anchor.verdict === 'reject' && thread.status === 'open',
  ).length;
  const latest = own.at(-1);
  if (!latest) return { state: 'pending', evidenceUpdated: false, rejectThreads };
  const at = openedAt(latest);
  if (stale.has(latest.id)) return { state: 'pending', at, evidenceUpdated: true, rejectThreads };
  if (latest.anchor.verdict === 'pass')
    return { state: 'pass', at, evidenceUpdated: false, rejectThreads };
  return {
    state: latest.status === 'open' ? 'reject' : 'pending',
    at,
    evidenceUpdated: false,
    rejectThreads,
  };
}

export function verifyGroupsOn(
  groups: Record<string, Pick<GroupSpec, 'boards' | 'verify'>>,
  boards: Record<string, { page: string }>,
  page: string | null,
) {
  return Object.entries(groups).filter(
    ([, group]) => group.verify === true && group.boards.some((id) => boards[id]?.page === page),
  );
}

export function verdictProgress(
  groups: Record<string, Pick<GroupSpec, 'boards' | 'verify'>>,
  boards: Record<string, { page: string }>,
  page: string | null,
  threads: BoardThread[],
  stale: ReadonlySet<string>,
): VerdictProgress {
  const verify = verifyGroupsOn(groups, boards, page);
  const states = verify.map(([id]) => [id, groupVerdict(threads, id, stale).state] as const);
  const next = states.find(([, state]) => state !== 'pass')?.[0];
  return {
    passed: states.filter(([, state]) => state === 'pass').length,
    total: verify.length,
    ...(next ? { next } : {}),
  };
}
