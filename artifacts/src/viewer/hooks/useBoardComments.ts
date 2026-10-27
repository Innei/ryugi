import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BoardAnchor, BoardHumanOp } from '../../shared/board-comments';
import type { BoardSpec } from '../../shared/types';
import type { ThreadActions } from '../comments/ThreadView';
import { clickAnchor, pinNumbers, selectionAnchor } from '../lib/board-anchor';
import type { BoardCommentsState } from '../lib/board-comments';
import type { Inspector, InspectorInput } from './useInspector';

type DragInput = Extract<InspectorInput, { type: 'ryugi:inspect:drag' }>;

interface Options {
  boards: Record<string, BoardSpec>;
  comment: ((op: BoardHumanOp) => Promise<BoardCommentsState>) | undefined;
  comments: BoardCommentsState | null | undefined;
  inspector: Inspector;
  page: string | null;
}

export function useBoardComments({ comments, comment, page, boards, inspector }: Options) {
  const [draft, setDraft] = useState<BoardAnchor | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const pending = useRef<{ boardId: string; id?: number; x: number; y: number } | null>(null);
  const threads = useMemo(() => comments?.comments.threads ?? [], [comments]);
  const stale = useMemo(() => new Set(comments?.stale ?? []), [comments]);
  const numbers = useMemo(() => pinNumbers(threads), [threads]);
  useEffect(() => {
    setDraft(null);
    setOpenId(null);
  }, [page]);

  const pathOf = useCallback(
    (boardId: string, id: number | undefined) =>
      id === undefined
        ? undefined
        : inspector.frames[boardId]?.nodes.find((node) => node.id === id)?.path,
    [inspector.frames],
  );

  const startDraft = useCallback((anchor: BoardAnchor) => {
    setOpenId(null);
    setDraft(anchor);
  }, []);

  const onFrameDrag = useCallback(
    (boardId: string, input: DragInput) => {
      if (!page) return;
      if (input.phase === 'start') {
        pending.current = { boardId, id: input.id, x: input.x, y: input.y };
        return;
      }
      const click = pending.current;
      pending.current = null;
      if (input.phase !== 'cancel' || !click || click.boardId !== boardId) return;
      const hover = inspector.hover;
      const rect =
        hover && hover.boardId === boardId && hover.id === click.id ? hover.rect : undefined;
      const path = pathOf(boardId, click.id);
      startDraft(clickAnchor(page, boardId, click, rect && path ? { rect, path } : undefined));
    },
    [page, inspector.hover, pathOf, startDraft],
  );

  const onCanvasClick = useCallback(
    (point: { x: number; y: number }) => {
      if (!page) return;
      const inside = Object.entries(boards).find(
        ([, b]) =>
          b.page === page &&
          point.x >= b.x &&
          point.x <= b.x + b.w &&
          point.y >= b.y &&
          point.y <= b.y + b.h,
      );
      startDraft(
        inside
          ? clickAnchor(page, inside[0], { x: point.x - inside[1].x, y: point.y - inside[1].y })
          : clickAnchor(page, null, point),
      );
    },
    [page, boards, startDraft],
  );

  const commentSelection = useCallback(() => {
    if (!page) return false;
    const anchor = selectionAnchor(
      page,
      inspector.selectedTargets.map((target) => ({
        boardId: target.boardId,
        rect: target.rect,
        path: pathOf(target.boardId, target.id),
      })),
    );
    if (!anchor) return false;
    startDraft(anchor);
    return true;
  }, [page, inspector.selectedTargets, pathOf, startDraft]);

  const submit = useCallback(
    async (text: string) => {
      if (!draft || !comment) return false;
      try {
        await comment({ op: 'create', anchor: draft, text });
        setDraft(null);
        return true;
      } catch {
        return false;
      }
    },
    [draft, comment],
  );

  const actions = useMemo<ThreadActions | undefined>(() => {
    if (!comment) return undefined;
    const run = (op: BoardHumanOp) =>
      comment(op).then(
        () => true,
        () => false,
      );
    return {
      reply: (threadId, text) => run({ op: 'reply', threadId, text }),
      edit: (threadId, messageId, text) => void run({ op: 'edit', threadId, messageId, text }),
      remove: (threadId, messageId) => void run({ op: 'delete', threadId, messageId }),
      resolve: (threadId) => void run({ op: 'resolve', threadId }),
      reopen: (threadId) => void run({ op: 'reopen', threadId }),
    };
  }, [comment]);

  const close = useCallback(() => {
    const had = draft !== null || openId !== null;
    setDraft(null);
    setOpenId(null);
    return had;
  }, [draft, openId]);

  return {
    threads,
    stale,
    numbers,
    draft,
    openId,
    setOpenId,
    onFrameDrag,
    onCanvasClick,
    commentSelection,
    submit,
    cancelDraft: () => setDraft(null),
    actions,
    close,
  };
}

export type BoardComments = ReturnType<typeof useBoardComments>;
