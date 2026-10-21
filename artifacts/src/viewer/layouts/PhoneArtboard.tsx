import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Bounds, CanvasLayout, CanvasSpec } from '../../shared/types';
import { Canvas } from '../components/Canvas';
import { CanvasErrorBoundary } from '../components/CanvasErrorBoundary';
import { Labels } from '../components/Labels';
import { PhoneArtboardBar } from '../components/PhoneArtboardBar';
import { PhoneBoard } from '../components/PhoneBoard';
import { QuestionSheet, SHEET_PEEK } from '../components/QuestionSheet';
import { useArtboardPage } from '../hooks/useArtboardPage';
import { usePanZoom } from '../hooks/usePanZoom';
import { useVerdicts } from '../hooks/useVerdicts';
import type { BoardCommentsState } from '../lib/board-comments';
import { openingQuestion, questionList, roundsOf, stepQuestion, type Question } from '../lib/questions';
import type { Insets } from '../lib/view';

const INSETS: Insets = { top: 16, right: 16, bottom: SHEET_PEEK + 16, left: 16 };
const TAP_SLOP = 8;
const NOTHING = new Set<string>();

const styles = stylex.create({
  root: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: cssVar.colorBgLayout },
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
  empty: { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, color: cssVar.colorTextSecondary, fontSize: 14, textAlign: 'center' },
});

interface Props {
  id: string;
  artifact: string | null;
  canvas: CanvasSpec | null;
  layout: CanvasLayout | null;
  warnings: string[];
  pending: string[];
  contentBase: string;
  versions: Record<string, number>;
  live?: boolean;
  loaded: boolean;
  agent?: string;
  menu?: boolean;
  comments?: BoardCommentsState | null;
}

const NO_THREADS: never[] = [];

export function PhoneArtboard({ id, artifact, canvas, layout, warnings, pending, contentBase, versions, live, loaded, agent, comments, menu = true }: Props) {
  const { viewportRef, view, fit, handlers } = usePanZoom('hand');
  const [current, setCurrent] = useState<string | null>(null);
  const [snap, setSnap] = useState(SHEET_PEEK);
  const [open, setOpen] = useState<string | null>(null);
  const tap = useRef<{ pointer: number; x: number; y: number } | null>(null);

  const show = useCallback((question: Question | null) => {
    if (!question) return false;
    setCurrent(question.id);
    fit(question.bounds, INSETS);
    return true;
  }, [fit]);
  const fitPage = useCallback((page: string) => {
    const pageLayout = layout?.pages[page];
    if (!canvas || !pageLayout) return false;
    if (show(openingQuestion(roundsOf(canvas, layout, page), canvas.focus?.target))) return true;
    setCurrent(null);
    if (pageLayout.bounds) fit(pageLayout.bounds, INSETS);
    return true;
  }, [canvas, layout, fit, show]);
  const fitFocus = useCallback((target: string, resolved: { page: string; bounds: Bounds }) => {
    if (canvas && layout && show(openingQuestion(roundsOf(canvas, layout, resolved.page), target))) return;
    fit(resolved.bounds, INSETS);
  }, [canvas, layout, fit, show]);
  const { page, changePage } = useArtboardPage({ canvas, layout, fitPage, fitFocus, startAtFocus: true });

  const rounds = useMemo(() => (canvas && layout && page ? roundsOf(canvas, layout, page) : []), [canvas, layout, page]);
  const list = useMemo(() => questionList(rounds), [rounds]);
  const question = list.find((q) => q.id === current) ?? null;
  const pick = (next: Question) => {
    show(next);
    setSnap(SHEET_PEEK);
  };

  const allBoards = canvas?.boards ?? {};
  const boards = useMemo(() => Object.entries(canvas?.boards ?? {}).filter(([, b]) => b.page === page), [canvas, page]);
  const groups = Object.entries(canvas?.groups ?? {}).filter(([, g]) => g.boards.some((boardId) => allBoards[boardId]?.page === page));
  const notes = Object.entries(canvas?.notes ?? {}).filter(([, n]) => n.page === page);
  const pendingBoards = useMemo(() => new Set(pending), [pending]);
  const stale = useMemo(() => new Set(comments?.stale ?? []), [comments]);
  const verdicts = useVerdicts({ canvas, page, threads: comments?.comments.threads ?? NO_THREADS, stale, versions });

  const boardAt = (event: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    const x = (event.clientX - rect.left - view.x) / view.k;
    const y = (event.clientY - rect.top - view.y) / view.k;
    return boards.find(([, b]) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.[0] ?? null;
  };
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    handlers.onPointerDown(event);
    const outside = !event.currentTarget.contains(event.target as Node) || (event.target as Element).closest('[data-chrome]');
    tap.current = tap.current || outside ? null : { pointer: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    handlers.onPointerMove(event);
    const start = tap.current;
    if (start && (start.pointer !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP)) tap.current = null;
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
  const loose = (q: Question) => !canvas?.groups?.[q.id];
  const openRound = open ? rounds.find((r) => r.questions.some((q) => q.boards.includes(open))) : undefined;
  const openQuestion = openRound?.questions.find((q) => q.boards.includes(open!));
  const siblings = !open ? [] : !openQuestion ? [open] : loose(openQuestion) ? openRound!.questions.filter(loose).map((q) => q.id) : openQuestion.boards;

  return (
    <div {...stylex.props(styles.root)}>
      <PhoneArtboardBar title={canvas?.title || id} pages={canvas?.pages ?? []} page={page} onPageChange={changePage} artifact={menu ? artifact : null} live={live} zoom={view.k} />
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
              view={view}
              boards={boards}
              notes={notes}
              contentBase={contentBase}
              versions={versions}
              pending={pendingBoards}
              playing={NOTHING}
              replays={{}}
              inspecting={false}
              frameRef={() => () => {}}
              frameLoaded={() => {}}
              writing={live ? canvas.writing : undefined}
              agent={agent}
            />
            <Labels
              view={view}
              boards={boards}
              groups={groups}
              allBoards={allBoards}
              contentBase={contentBase}
              versions={versions}
              pending={pendingBoards}
              playing={NOTHING}
              onExpand={setOpen}
              onTogglePlay={setOpen}
              onReplay={() => {}}
              verdicts={verdicts}
            />
          </CanvasErrorBoundary>
        ) : (
          <div {...stylex.props(styles.empty)}>{loaded ? (warnings[0] ?? 'Waiting for the agent to write canvas.json…') : 'Connecting…'}</div>
        )}
        {list.length > 0 ? (
          <div data-chrome {...stylex.props(styles.dock)}>
            <QuestionSheet
              rounds={rounds}
              current={question}
              previous={current ? stepQuestion(list, current, -1) : null}
              next={current ? stepQuestion(list, current, 1) : null}
              pages={canvas?.pages ?? []}
              page={page}
              onPageChange={changePage}
              onPick={pick}
              snap={snap}
              onSnap={setSnap}
            />
          </div>
        ) : null}
      </div>
      {open && openBoard ? (
        <PhoneBoard
          id={open}
          board={openBoard}
          src={`${contentBase}${openBoard.file}?v=${versions[openBoard.file] ?? 0}`}
          siblings={siblings}
          onOpen={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
