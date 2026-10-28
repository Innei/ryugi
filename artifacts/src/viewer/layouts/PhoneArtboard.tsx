import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { Bounds, CanvasLayout, CanvasSpec } from '../../shared/types';
import { Canvas } from '../components/Canvas';
import { CanvasErrorBoundary } from '../components/CanvasErrorBoundary';
import { Labels } from '../components/Labels';
import { PhoneArtboardBar } from '../components/PhoneArtboardBar';
import { PhoneBoard } from '../components/PhoneBoard';
import { QuestionSheet, SHEET_PEEK } from '../components/QuestionSheet';
import { useArtboardPage } from '../hooks/useArtboardPage';
import { useBoardTiers } from '../hooks/useBoardTiers';
import { usePanZoom } from '../hooks/usePanZoom';
import { useVerdicts } from '../hooks/useVerdicts';
import type { BoardCommentsState } from '../lib/board-comments';
import { visibleRenders } from '../lib/board-tiers';
import {
  openingQuestion,
  type Question,
  questionList,
  roundsOf,
  stepQuestion,
} from '../lib/questions';
import type { Insets } from '../lib/view';

const INSETS: Insets = { top: 16, right: 16, bottom: SHEET_PEEK + 16, left: 16 };
const TAP_SLOP = 8;
const NOTHING = new Set<string>();

const styles = stylex.create({
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: cssVar.colorBgLayout,
  },
  viewport: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    touchAction: 'none',
    userSelect: 'none',
    fontFamily: cssVar.fontFamily,
    color: cssVar.colorText,
  },
  dock: { position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    color: cssVar.colorTextSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
});

interface Props {
  actions?: ReactNode;
  agent?: string;
  artifact: string | null;
  canvas: CanvasSpec | null;
  comments?: BoardCommentsState | null;
  contentBase: string;
  id: string;
  layout: CanvasLayout | null;
  live?: boolean;
  loaded: boolean;
  pending: string[];
  tiers?: boolean;
  versions: Record<string, number>;
  warnings: string[];
}

const NO_THREADS: never[] = [];

export function PhoneArtboard({
  id,
  artifact,
  canvas,
  layout,
  warnings,
  pending,
  contentBase,
  versions,
  live,
  loaded,
  agent,
  comments,
  actions,
  tiers: tiered = true,
}: Props) {
  const { viewportRef, view, size, scaling, fit, handlers } = usePanZoom('hand');
  const [current, setCurrent] = useState<string | null>(null);
  const [snap, setSnap] = useState(SHEET_PEEK);
  const [open, setOpen] = useState<string | null>(null);
  const tap = useRef<{ pointer: number; x: number; y: number } | null>(null);

  const show = useCallback(
    (question: Question | null, animate = false) => {
      if (!question) return false;
      setCurrent(question.id);
      fit(question.bounds, INSETS, { animate });
      return true;
    },
    [fit],
  );
  const fitPage = useCallback(
    (page: string) => {
      const pageLayout = layout?.pages[page];
      if (!canvas || !pageLayout) return false;
      if (show(openingQuestion(roundsOf(canvas, layout, page), canvas.focus?.target))) return true;
      setCurrent(null);
      if (pageLayout.bounds) fit(pageLayout.bounds, INSETS);
      return true;
    },
    [canvas, layout, fit, show],
  );
  const fitFocus = useCallback(
    (target: string, resolved: { page: string; bounds: Bounds }) => {
      if (
        canvas &&
        layout &&
        show(openingQuestion(roundsOf(canvas, layout, resolved.page), target))
      )
        return;
      fit(resolved.bounds, INSETS);
    },
    [canvas, layout, fit, show],
  );
  const { page, changePage } = useArtboardPage({
    canvas,
    layout,
    fitPage,
    fitFocus,
    startAtFocus: true,
  });

  const rounds = useMemo(
    () => (canvas && layout && page ? roundsOf(canvas, layout, page) : []),
    [canvas, layout, page],
  );
  const list = useMemo(() => questionList(rounds), [rounds]);
  const question = list.find((q) => q.id === current) ?? null;
  const pick = (next: Question) => {
    show(next, true);
    setSnap(SHEET_PEEK);
  };

  const allBoards = canvas?.boards ?? {};
  const boards = useMemo(
    () => Object.entries(canvas?.boards ?? {}).filter(([, b]) => b.page === page),
    [canvas, page],
  );
  const groups = Object.entries(canvas?.groups ?? {}).filter(([, g]) =>
    g.boards.some((boardId) => allBoards[boardId]?.page === page),
  );
  const notes = Object.entries(canvas?.notes ?? {}).filter(([, n]) => n.page === page);
  const pendingBoards = useMemo(() => new Set(pending), [pending]);
  const tierState = useBoardTiers({
    artifact: artifact ?? id,
    boards: tiered ? boards : [],
    versions,
    pending: pendingBoards,
    view,
    scaling,
    viewport: size,
    pinned: NOTHING,
    hovered: null,
    hoverPromotes: false,
    persistable: () => true,
    // Inline boards on a phone are previews; the full-screen PhoneBoard is the live one.
    preview: true,
  });
  const stale = useMemo(() => new Set(comments?.stale ?? []), [comments]);
  const verdicts = useVerdicts({
    canvas,
    page,
    threads: comments?.comments.threads ?? NO_THREADS,
    stale,
    versions,
  });

  const boardAt = (event: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    const x = (event.clientX - rect.left - view.x) / view.k;
    const y = (event.clientY - rect.top - view.y) / view.k;
    return (
      boards.find(([, b]) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.[0] ?? null
    );
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    handlers.onPointerDown(event);
    const outside =
      !event.currentTarget.contains(event.target as Node) ||
      (event.target as Element).closest('[data-chrome]');
    tap.current =
      tap.current || outside
        ? null
        : { pointer: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    handlers.onPointerMove(event);
    const start = tap.current;
    if (
      start &&
      (start.pointer !== event.pointerId ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP)
    )
      tap.current = null;
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    handlers.onPointerUp(event);
    const start = tap.current;
    tap.current = null;
    if (start?.pointer !== event.pointerId) return;
    const hit = boardAt(event);
    if (hit) setOpen(hit);
  };

  const openBoard = open ? allBoards[open] : undefined;
  const box = viewportRef.current?.getBoundingClientRect();
  const origin =
    openBoard && box
      ? {
          x: box.left + view.x + openBoard.x * view.k,
          y: box.top + view.y + openBoard.y * view.k,
          w: openBoard.w * view.k,
          h: openBoard.h * view.k,
        }
      : undefined;
  const loose = (q: Question) => !canvas?.groups?.[q.id];
  const openRound = open
    ? rounds.find((r) => r.questions.some((q) => q.boards.includes(open)))
    : undefined;
  const openQuestion = openRound?.questions.find((q) => q.boards.includes(open!));
  const siblings = !open
    ? []
    : !openQuestion
      ? [open]
      : loose(openQuestion)
        ? openRound!.questions.filter(loose).map((q) => q.id)
        : openQuestion.boards;

  return (
    <div {...stylex.props(styles.root)}>
      <PhoneArtboardBar
        actions={actions}
        live={live}
        page={page}
        pages={canvas?.pages ?? []}
        title={canvas?.title || id}
        onPageChange={changePage}
      />
      <div
        ref={viewportRef}
        {...stylex.props(styles.viewport)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => {
          handlers.onPointerCancel(event);
          tap.current = null;
        }}
      >
        {canvas && layout ? (
          <CanvasErrorBoundary resetKey={canvas}>
            <Canvas
              agent={agent}
              boards={boards}
              contentBase={contentBase}
              frameLoaded={tiered ? tierState.loaded : () => {}}
              frameRef={tiered ? tierState.frameRef : () => () => {}}
              inspecting={false}
              live={live}
              notes={notes}
              pending={pendingBoards}
              playing={NOTHING}
              replays={{}}
              versions={versions}
              view={view}
              writing={live ? canvas.writing : undefined}
              renders={
                tiered
                  ? tierState.renders
                  : visibleRenders({
                      boards: boards.map(([id, board]) => ({ id, ...board })),
                      view,
                      viewport: size,
                    })
              }
              onImageError={tiered ? tierState.imageFailed : undefined}
            />
            <Labels
              allBoards={allBoards}
              boards={boards}
              contentBase={contentBase}
              groups={groups}
              pending={pendingBoards}
              playing={NOTHING}
              verdicts={verdicts}
              versions={versions}
              view={view}
              onExpand={setOpen}
              onReplay={() => {}}
              onTogglePlay={setOpen}
            />
          </CanvasErrorBoundary>
        ) : (
          <div {...stylex.props(styles.empty)}>
            {loaded
              ? (warnings[0] ?? 'Waiting for the agent to write canvas.json…')
              : 'Connecting…'}
          </div>
        )}
        {list.length > 0 ? (
          <div data-chrome {...stylex.props(styles.dock)}>
            <QuestionSheet
              current={question}
              next={current ? stepQuestion(list, current, 1) : null}
              page={page}
              pages={canvas?.pages ?? []}
              previous={current ? stepQuestion(list, current, -1) : null}
              rounds={rounds}
              snap={snap}
              verdicts={verdicts.states}
              onPageChange={changePage}
              onPick={pick}
              onSnap={setSnap}
            />
          </div>
        ) : null}
      </div>
      {open && openBoard ? (
        <PhoneBoard
          board={openBoard}
          id={open}
          origin={origin}
          siblings={siblings}
          src={`${contentBase}${openBoard.file}?v=${versions[openBoard.file] ?? 0}`}
          onClose={() => setOpen(null)}
          onOpen={setOpen}
        />
      ) : null}
    </div>
  );
}
