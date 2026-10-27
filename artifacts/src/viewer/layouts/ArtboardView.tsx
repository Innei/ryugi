import { Button, IconProvider } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BoardHumanOp } from '../../shared/board-comments';
import type { InspectorReport } from '../../shared/inspector';
import type { SelectionMessage } from '../../shared/selection';
import { reconcileTweakValues } from '../../shared/tweaks';
import type { Bounds } from '../../shared/types';
import { CommentsPanel, type CommentsTab } from '../comments/CommentsPanel';
import { Canvas } from '../components/Canvas';
import { CanvasErrorBoundary } from '../components/CanvasErrorBoundary';
import { CommentLayer } from '../components/CommentLayer';
import { DebugHud } from '../components/DebugHud';
import { ExpandedBoard } from '../components/ExpandedBoard';
import { HandCursor } from '../components/HandCursor';
import { Labels } from '../components/Labels';
import { TopLeftBar, TopRightBar } from '../components/Toolbar';
import { useArtboardPage } from '../hooks/useArtboardPage';
import { useBoardComments } from '../hooks/useBoardComments';
import { useBoardTiers } from '../hooks/useBoardTiers';
import { useBoardTweaks } from '../hooks/useBoardTweaks';
import type { useCanvasData } from '../hooks/useCanvasData';
import { useHoverDwell } from '../hooks/useHoverDwell';
import { useInspector } from '../hooks/useInspector';
import { useKeptBoards } from '../hooks/useKeptBoards';
import { useMarqueeSelection } from '../hooks/useMarqueeSelection';
import { PHONE_QUERY, useMedia } from '../hooks/useMedia';
import { type Tool, usePanZoom } from '../hooks/usePanZoom';
import { useSelectionSync } from '../hooks/useSelectionSync';
import { useTypeFavicon } from '../hooks/useTypeFavicon';
import { useVerdicts } from '../hooks/useVerdicts';
import { t } from '../i18n';
import { InspectionOutline } from '../inspector/InspectionOutline';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { pinPoint } from '../lib/board-anchor';
import type { BoardCommentsState } from '../lib/board-comments';
import { visibleRenders } from '../lib/board-tiers';
import { togglePlaying } from '../lib/play';
import { revealTweakPanel, tweakPanelAnchor, TweaksPanel } from '../tweaks/TweaksPanel';
import { RejectComposer } from '../verdicts/RejectComposer';
import { PhoneArtboard } from './PhoneArtboard';

const styles = stylex.create({
  layout: { display: 'flex', width: '100%', height: '100%', overflow: 'hidden' },
  viewport: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    touchAction: 'none',
    userSelect: 'none',
    backgroundColor: cssVar.colorBgLayout,
    fontFamily: cssVar.fontFamily,
    color: cssVar.colorText,
  },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    color: cssVar.colorTextSecondary,
    fontSize: 14,
    textAlign: 'center',
    pointerEvents: 'none',
  },
});

export type ArtboardViewProps = Omit<
  ReturnType<typeof useCanvasData>,
  'live' | 'stale' | 'send' | 'comments' | 'comment'
> & {
  id: string;
  artifact: string | null;
  live?: boolean;
  actions?: ReactNode;
  tiers?: boolean;
  send?: (message: SelectionMessage) => void;
  comments?: BoardCommentsState | null;
  comment?: (op: BoardHumanOp) => Promise<BoardCommentsState>;
};

export function ArtboardView(props: ArtboardViewProps) {
  const phone = useMedia(PHONE_QUERY);
  return phone ? <PhoneArtboard {...props} /> : <DesktopArtboard {...props} />;
}

function DesktopArtboard({
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
  send,
  agent,
  comments,
  comment,
  actions,
  tiers: tiered = true,
}: ArtboardViewProps) {
  const [tool, setTool] = useState<Tool>('select');
  const {
    viewportRef,
    view,
    scaling,
    size,
    fit,
    zoomBy,
    zoomTo,
    cursor,
    hand,
    handlers,
    panBy,
    wheelAt,
    panning,
    setSpaceHeld,
  } = usePanZoom(tool);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [debug] = useState(() => new URLSearchParams(location.search).has('debug'));
  const [commentsTab, setCommentsTab] = useState<CommentsTab>('open');
  const pageBounds = (id: string | null) => (id && layout?.pages[id]?.bounds) || null;
  const fitPage = useCallback(
    (id: string) => {
      const bounds = layout?.pages[id]?.bounds;
      if (!bounds) return false;
      fit(bounds);
      return true;
    },
    [layout, fit],
  );
  const fitFocus = useCallback(
    (_target: string, resolved: { bounds: Bounds }) => fit(resolved.bounds),
    [fit],
  );
  const { page, changePage } = useArtboardPage({ canvas, layout, fitPage, fitFocus });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [playing, setPlaying] = useState<ReadonlySet<string>>(() => new Set());
  const [replays, setReplays] = useState<Record<string, number>>({});
  const parameters = useBoardTweaks(id);
  const [parameterBoard, setParameterBoard] = useState<string | null>(null);
  const parameterTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => setParameterBoard(null), [page, id]);
  const closeParameters = () => {
    setParameterBoard(null);
    parameterTrigger.current?.focus();
  };
  const toggleParameters = (id: string, trigger: HTMLElement) => {
    parameterTrigger.current = trigger;
    const board = canvas?.boards[id],
      viewport = viewportRef.current;
    if (parameterBoard !== id && !expanded && board && viewport) {
      const offset = revealTweakPanel(board, view, {
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
      if (offset.x || offset.y) panBy(offset.x, offset.y);
    }
    setParameterBoard((current) => (current === id ? null : id));
  };
  const selectionEnabled = tool === 'select' && !expanded && !panning;
  const commentTool = tool === 'comment';
  const inspectorEnabled = !expanded && (tool === 'select' || commentTool || inspectorOpen);
  const inspector = useInspector({
    enabled: inspectorEnabled,
    mode: commentTool ? 'comment' : 'select',
    playing,
    onInput: (boardId, input) => {
      const board = canvas?.boards[boardId];
      if (!board) return;
      if (input.type === 'ryugi:inspect:wheel')
        wheelAt({
          ...input,
          x: view.x + (board.x + input.x) * view.k,
          y: view.y + (board.y + input.y) * view.k,
        });
      else if (input.type === 'ryugi:inspect:pan') panBy(input.deltaX, input.deltaY);
      else if (input.type === 'ryugi:inspect:drag') {
        if (commentTool) boardComments.onFrameDrag(boardId, input);
        else if (selectionEnabled)
          selection.drag(
            input.phase,
            board.x + input.x,
            board.y + input.y,
            input.append,
            input.id ? { boardId, id: input.id } : undefined,
          );
      } else if (input.code === 'Space') setSpaceHeld(input.down);
      else if (input.down) onKey(input);
    },
  });
  useSelectionSync({ artifact, boards: canvas?.boards, live, inspector, send });
  const boardComments = useBoardComments({
    comments,
    comment,
    page,
    boards: canvas?.boards ?? {},
    inspector,
  });
  const verdicts = useVerdicts({
    canvas,
    page,
    threads: boardComments.threads,
    stale: boardComments.stale,
    versions,
    comment,
  });
  const rejectAt = verdicts.rejecting ? verdicts.origin(verdicts.rejecting) : null;
  const nextVerify = () => {
    const rect =
      verdicts.progress.next && page
        ? layout?.pages[page]?.groups[verdicts.progress.next]
        : undefined;
    if (rect) fit({ minX: rect.x, minY: rect.y, maxX: rect.x + rect.w, maxY: rect.y + rect.h });
  };
  const changeTool = (next: Tool) => {
    if (next === 'comment' && !comment) return;
    if (next === 'comment' && tool === 'select') boardComments.commentSelection();
    if (next !== 'comment') boardComments.close();
    setTool(next);
  };
  const openThread = (threadId: string) => {
    const thread = boardComments.threads.find((t) => t.id === threadId);
    const point = thread && pinPoint(thread.anchor, canvas?.boards ?? {});
    const el = viewportRef.current;
    if (point && el)
      panBy(
        el.clientWidth / 2 - (view.x + point.x * view.k),
        el.clientHeight / 2 - (view.y + point.y * view.k),
      );
    boardComments.setOpenId(threadId);
  };
  const closeInspector = useCallback(() => setInspectorOpen(false), []);
  useEffect(() => {
    if (expanded) setSpaceHeld(false);
  }, [expanded, setSpaceHeld]);
  const pendingBoards = useMemo(() => new Set(pending), [pending]);

  const pages = canvas?.pages ?? [];

  useEffect(() => {
    document.title = canvas?.title || id;
  }, [canvas?.title, id]);
  useTypeFavicon('artboard');
  function onKey(e: KeyboardEvent | Extract<InspectorReport, { type: 'ryugi:inspect:key' }>) {
    if (
      'target' in e &&
      (e.target as HTMLElement | null)?.closest?.(
        'input, textarea, select, [contenteditable], [role="tree"], [role="treeitem"], [data-chrome="parameters"]',
      )
    )
      return;
    const prevent = () => {
      if ('preventDefault' in e) e.preventDefault();
    };
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape' && commentTool) {
      if (!boardComments.close()) changeTool('select');
    } else if (e.key === 'Escape') {
      if (parameterBoard) closeParameters();
      else {
        setExpanded(null);
        inspector.clearSelection();
        selection.reset();
      }
    } else if (mod && (e.key === '=' || e.key === '+')) {
      prevent();
      zoomBy(1.25);
    } else if (mod && e.key === '-') {
      prevent();
      zoomBy(0.8);
    } else if (e.shiftKey && e.code === 'Digit1') fit(pageBounds(page));
    else if (e.shiftKey && e.code === 'Digit0') zoomTo(1);
    else if (!mod && !e.shiftKey && e.key.toLowerCase() === 'v') changeTool('select');
    else if (!mod && !e.shiftKey && e.key.toLowerCase() === 'h') changeTool('hand');
    else if (!mod && !e.shiftKey && e.key.toLowerCase() === 'c') {
      prevent();
      changeTool('comment');
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const allBoards = canvas?.boards ?? {};
  const boards = useMemo(
    () => Object.entries(canvas?.boards ?? {}).filter(([, b]) => b.page === page),
    [canvas, page],
  );
  const groups = Object.entries(canvas?.groups ?? {}).filter(([, g]) =>
    g.boards.some((id) => allBoards[id]?.page === page),
  );
  const notes = Object.entries(canvas?.notes ?? {}).filter(([, n]) => n.page === page);
  const expandedBoard = expanded ? allBoards[expanded] : undefined;
  const parameterCounts = Object.fromEntries(
    Object.entries(parameters.states).flatMap(([id, state]) => {
      const count = Object.keys(state.schema?.controls ?? {}).length;
      return count || state.error ? [[id, count]] : [];
    }),
  );
  const parameterState = parameterBoard ? parameters.states[parameterBoard] : undefined;
  const parameterSpec = parameterBoard ? allBoards[parameterBoard] : undefined;
  const panel = (anchored: boolean) =>
    parameterBoard &&
    parameterState &&
    parameterSpec &&
    (parameterState.schema || parameterState.error) ? (
      <TweaksPanel
        anchor={anchored ? tweakPanelAnchor(parameterSpec, view) : undefined}
        boardId={parameterBoard}
        state={parameterState}
        title={parameterSpec.title ?? parameterBoard}
        onChange={(key, value) => parameters.change(parameterBoard, key, value)}
        onClose={closeParameters}
        onReset={() => parameters.reset(parameterBoard)}
      />
    ) : null;
  const expandedReady = expandedBoard
    ? (versions[expandedBoard.file] ?? 0) > 0 && !pendingBoards.has(expanded!)
    : false;

  const selection = useMarqueeSelection(boards, inspector, view.k, [tool, expanded, page, panning]);
  const worldPoint = (event: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - view.x) / view.k,
      y: (event.clientY - rect.top - view.y) / view.k,
    };
  };
  const boardAt = (point: { x: number; y: number }) =>
    boards.find(
      ([, b]) => point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h,
    )?.[0] ?? null;
  const hover = useHoverDwell({
    scaling,
    view,
    inside: inspector.hover?.boardId ?? null,
    locate: (client) => {
      const point = worldPoint(client);
      return { board: boardAt(point), x: point.x * view.k, y: point.y * view.k };
    },
  });
  const marquee = selection.marquee;
  const kept = useKeptBoards(boards, versions, (board) => !inspectorEnabled || playing.has(board));
  const pinned = useMemo(
    () =>
      new Set([
        ...kept,
        ...playing,
        ...[expanded, parameterBoard].filter((board): board is string => !!board),
        ...inspector.selectedTargets.map((target) => target.boardId),
        ...Object.entries(inspector.frames)
          .filter(([, frame]) => frame.tweaks.length > 0)
          .map(([id]) => id),
        ...(marquee
          ? boards
              .filter(
                ([, b]) =>
                  b.x < marquee.x + marquee.width &&
                  b.x + b.w > marquee.x &&
                  b.y < marquee.y + marquee.height &&
                  b.y + b.h > marquee.y,
              )
              .map(([id]) => id)
          : []),
      ]),
    [
      kept,
      playing,
      expanded,
      parameterBoard,
      inspector.selectedTargets,
      inspector.frames,
      marquee,
      boards,
    ],
  );
  const persistable = (board: string) => {
    const state = parameters.states[board];
    const tweaked =
      !!state?.schema &&
      JSON.stringify(state.values) !== JSON.stringify(reconcileTweakValues(state.schema));
    return !tweaked && !inspector.frames[board]?.tweaks.length;
  };
  const tiers = useBoardTiers({
    artifact: artifact ?? id,
    boards: tiered ? boards : [],
    versions,
    pending: pendingBoards,
    view,
    scaling,
    viewport: size,
    pinned,
    hovered: hover.hovered,
    hoverPromotes: tool === 'select' || commentTool,
    persistable,
  });
  const renders = tiered
    ? tiers.renders
    : visibleRenders({
        boards: boards.map(([board, spec]) => ({ id: board, ...spec })),
        view,
        viewport: size,
      });
  const frameRef = useMemo(() => {
    const refs = new Map<string, (element: HTMLIFrameElement | null) => void>();
    return (id: string) => {
      if (!refs.has(id))
        refs.set(id, (element) => {
          parameters.refFor(id)(element);
          inspector.refFor(id)(element);
          tiers.frameRef(id)(element);
        });
      return refs.get(id)!;
    };
  }, [parameters.refFor, inspector.refFor, tiers.frameRef]);
  const frameLoaded = useCallback(
    (id: string) => {
      parameters.loaded(id);
      inspector.loaded(id);
      tiers.loaded(id);
    },
    [parameters.loaded, inspector.loaded, tiers.loaded],
  );

  return (
    <div {...stylex.props(styles.layout)}>
      <div
        ref={viewportRef}
        {...stylex.props(styles.viewport)}
        style={{ cursor }}
        onPointerLeave={hover.leave}
        onClickCapture={(event) => {
          if (
            !expanded &&
            (commentTool || panning) &&
            (event.target as Element).closest('[data-video-surface]')
          )
            event.stopPropagation();
        }}
        onPointerCancel={(event) => {
          handlers.onPointerCancel(event);
          selection.reset();
        }}
        onPointerDown={(event) => {
          handlers.onPointerDown(event);
          if (
            commentTool &&
            !panning &&
            !expanded &&
            event.button === 0 &&
            event.pointerType !== 'touch' &&
            event.currentTarget.contains(event.target as Node) &&
            !(event.target as Element).closest('[data-chrome]')
          ) {
            // mousedown's default focus would pull focus off the draft composer's autofocus
            event.preventDefault();
            boardComments.onCanvasClick(worldPoint(event));
          }
          if (
            !selectionEnabled ||
            event.pointerType === 'touch' ||
            event.button !== 0 ||
            !event.currentTarget.contains(event.target as Node) ||
            (event.target as Element).closest('[data-chrome], [data-video-surface]')
          )
            return;
          const point = worldPoint(event);
          event.currentTarget.setPointerCapture(event.pointerId);
          selection.drag(
            'start',
            point.x,
            point.y,
            event.shiftKey || event.metaKey || event.ctrlKey,
          );
        }}
        onPointerMove={(event) => {
          handlers.onPointerMove(event);
          hover.track(event);
          if (selection.dragging()) {
            if (event.buttons === 1) event.currentTarget.setPointerCapture(event.pointerId);
            const point = worldPoint(event);
            selection.drag('move', point.x, point.y);
          }
        }}
        onPointerUp={(event) => {
          handlers.onPointerUp(event);
          if (selection.dragging()) {
            const point = worldPoint(event);
            selection.drag('end', point.x, point.y);
          }
        }}
      >
        <HandCursor hand={hand} viewport={viewportRef} />
        {debug && <DebugHud renders={renders} scaling={scaling} />}
        {canvas && layout && (
          <CanvasErrorBoundary resetKey={canvas}>
            <Canvas
              agent={agent}
              boards={boards}
              contentBase={contentBase}
              frameLoaded={frameLoaded}
              frameRef={frameRef}
              inspecting={selectionEnabled || (commentTool && !expanded && !panning)}
              live={live}
              notes={notes}
              pending={pendingBoards}
              playing={playing}
              renders={renders}
              replays={replays}
              versions={versions}
              view={view}
              writing={live ? canvas.writing : undefined}
              onExpand={setExpanded}
              onImageError={tiers.imageFailed}
            />
            <Labels
              activeParameters={parameterBoard}
              allBoards={allBoards}
              boards={boards}
              contentBase={contentBase}
              groups={groups}
              parameters={parameterCounts}
              pending={pendingBoards}
              playing={playing}
              verdicts={verdicts}
              versions={versions}
              view={view}
              onExpand={setExpanded}
              onReplay={(id) => setReplays((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))}
              onToggleParameters={toggleParameters}
              onTogglePlay={(id) => setPlaying((current) => togglePlaying(current, id))}
            />
            {verdicts.rejecting && rejectAt && (
              <RejectComposer
                group={verdicts.rejecting}
                left={view.x + rejectAt.x * view.k}
                top={view.y + rejectAt.y * view.k + 8}
                onCancel={verdicts.cancelReject}
                onSubmit={verdicts.submitReject}
              />
            )}
            {commentTool && (
              <CommentLayer
                actions={boardComments.actions}
                agent={agent}
                boards={allBoards}
                draft={boardComments.draft}
                numbers={boardComments.numbers}
                openId={boardComments.openId}
                page={page}
                showResolved={commentsTab === 'all'}
                stale={boardComments.stale}
                threads={boardComments.threads}
                view={view}
                width={viewportRef.current?.clientWidth ?? 0}
                onCancelDraft={boardComments.cancelDraft}
                onOpen={boardComments.setOpenId}
                onSubmit={boardComments.submit}
              />
            )}
          </CanvasErrorBoundary>
        )}
        {(selectionEnabled || commentTool) &&
          !selection.marquee &&
          inspector.hover &&
          allBoards[inspector.hover.boardId] && (
            <InspectionOutline
              board={allBoards[inspector.hover.boardId]!}
              rect={inspector.hover.rect}
              view={view}
              nodeId={
                inspector.hover.id ? `${inspector.hover.boardId}#${inspector.hover.id}` : undefined
              }
            />
          )}
        {!expanded &&
          inspector.targets.map(
            (target) =>
              allBoards[target.boardId] && (
                <InspectionOutline
                  selected
                  board={allBoards[target.boardId]!}
                  key={`${target.boardId}:${target.id}`}
                  name={target.name}
                  rect={target.rect}
                  view={view}
                />
              ),
          )}
        {selection.selecting && <div aria-hidden="true" className="ri-selection-capture" />}
        {selection.marquee && (
          <div
            aria-hidden="true"
            className="ri-marquee"
            style={{
              left: view.x + selection.marquee.x * view.k,
              top: view.y + selection.marquee.y * view.k,
              width: selection.marquee.width * view.k,
              height: selection.marquee.height * view.k,
            }}
          />
        )}
        {(!canvas || !layout) && (
          <div {...stylex.props(styles.empty)}>
            {loaded ? (warnings[0] ?? t('chrome.waitingCanvas')) : t('common.connecting')}
          </div>
        )}
        <TopLeftBar
          commenting={!!comment}
          page={page}
          pages={pages}
          tool={tool}
          onPageChange={changePage}
          onToolChange={changeTool}
        />
        <TopRightBar
          actions={actions}
          inspectorOpen={inspectorOpen}
          live={live}
          verify={verdicts.progress}
          warnings={warnings}
          zoom={view.k}
          onActualSize={() => zoomTo(1)}
          onFit={() => fit(pageBounds(page))}
          onNextVerify={nextVerify}
          onToggleInspector={() => setInspectorOpen((open) => !open)}
          onZoomIn={() => zoomBy(1.25)}
          onZoomOut={() => zoomBy(0.8)}
        />
        {!expanded && panel(true)}
        {expanded && expandedBoard && expandedReady && (
          <ExpandedBoard
            board={expandedBoard}
            frameRef={parameters.refFor(expanded, 'expanded')}
            id={expanded}
            interactive={expandedBoard.interactive === true}
            parameters={parameterBoard === expanded ? panel(false) : undefined}
            src={`${contentBase}${expandedBoard.file}?v=${versions[expandedBoard.file] ?? 0}`}
            parameterAction={
              parameterCounts[expanded] !== undefined ? (
                <IconProvider config={{ 'aria-hidden': true }}>
                  <Button
                    aria-expanded={parameterBoard === expanded}
                    icon={SlidersHorizontal}
                    size="small"
                    type="text"
                    onClick={(event) => toggleParameters(expanded, event.currentTarget)}
                  >
                    {t('chrome.parameters')}
                  </Button>
                </IconProvider>
              ) : undefined
            }
            onClose={() => setExpanded(null)}
            onFrameLoad={() => parameters.loaded(expanded, 'expanded')}
          />
        )}
      </div>
      {commentTool && (
        <CommentsPanel
          numbers={boardComments.numbers}
          openId={boardComments.openId}
          page={page}
          stale={boardComments.stale}
          tab={commentsTab}
          threads={boardComments.threads}
          onClose={() => changeTool('select')}
          onOpen={openThread}
          onTab={setCommentsTab}
        />
      )}
      {inspectorOpen && !commentTool && (
        <InspectorPanel
          boards={boards}
          change={inspector.change}
          enabled={!expanded}
          frames={inspector.frames}
          hoverNode={inspector.hoverNode}
          playing={playing}
          reset={inspector.reset}
          select={inspector.select}
          selection={inspector.selection}
          targets={inspector.targets}
          onClose={closeInspector}
        />
      )}
    </div>
  );
}
