import { useMemo, useState } from 'react';
import type { BoardHumanOp, BoardThread } from '../../shared/board-comments';
import type { CanvasSpec } from '../../shared/types';
import {
  groupVerdict,
  verdictProgress,
  verifyGroupsOn,
  type GroupVerdict,
} from '../../shared/verdicts';

interface Options {
  canvas: CanvasSpec | null | undefined;
  page: string | null;
  threads: BoardThread[];
  stale: ReadonlySet<string>;
  versions: Record<string, number>;
  comment?: (op: BoardHumanOp) => Promise<unknown>;
}

export function useVerdicts({ canvas, page, threads, stale, versions, comment }: Options) {
  const [rejecting, setRejecting] = useState<string | null>(null);
  const groups = useMemo(() => canvas?.groups ?? {}, [canvas]);
  const boards = useMemo(() => canvas?.boards ?? {}, [canvas]);
  const states = useMemo<Record<string, GroupVerdict>>(
    () =>
      Object.fromEntries(
        verifyGroupsOn(groups, boards, page).map(([id]) => [id, groupVerdict(threads, id, stale)]),
      ),
    [groups, boards, page, threads, stale],
  );
  const progress = useMemo(
    () => verdictProgress(groups, boards, page, threads, stale),
    [groups, boards, page, threads, stale],
  );
  const members = (id: string) =>
    (groups[id]?.boards ?? []).flatMap((board) => (boards[board] ? [boards[board]!] : []));
  const corner = (id: string) => ({
    x: Math.max(...members(id).map((b) => b.x + b.w)),
    y: Math.min(...members(id).map((b) => b.y)),
  });
  const evidenceAt = (id: string) => Math.max(0, ...members(id).map((b) => versions[b.file] ?? 0));

  const send = async (id: string, verdict: 'pass' | 'reject', text: string) => {
    if (!comment || !page) return false;
    try {
      await comment({ op: 'create', anchor: { page, group: id, verdict, ...corner(id) }, text });
      return true;
    } catch {
      return false;
    }
  };

  return {
    states,
    progress,
    rejecting,
    canJudge: !!comment,
    evidenceAt,
    origin: (id: string) => ({
      x: Math.min(...members(id).map((b) => b.x)),
      y: Math.min(...members(id).map((b) => b.y)),
    }),
    pass: (id: string) => void send(id, 'pass', 'Pass'),
    undoPass: (id: string) => {
      const pass = threads
        .filter(
          (t) =>
            t.anchor.group === id &&
            t.anchor.verdict === 'pass' &&
            t.messages.some((m) => !m.deleted),
        )
        .at(-1);
      const message = pass?.messages.find((m) => !m.deleted);
      if (pass && message && comment)
        void comment({ op: 'delete', threadId: pass.id, messageId: message.id }).catch(() => {});
    },
    startReject: (id: string) => setRejecting(id),
    cancelReject: () => setRejecting(null),
    submitReject: async (text: string) => {
      if (!rejecting) return false;
      const ok = await send(rejecting, 'reject', text);
      if (ok) setRejecting(null);
      return ok;
    },
  };
}

export type Verdicts = ReturnType<typeof useVerdicts>;
