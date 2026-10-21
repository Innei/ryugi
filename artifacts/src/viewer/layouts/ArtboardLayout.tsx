import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InspectorRect, InspectorReport } from '../../shared/inspector';
import type { SelectionMessage } from '../../shared/selection';
import { Canvas } from '../components/Canvas';
import { CanvasErrorBoundary } from '../components/CanvasErrorBoundary';
import { ExpandedBoard } from '../components/ExpandedBoard';
import { Labels } from '../components/Labels';
import { TopLeftBar, TopRightBar } from '../components/Toolbar';
import { useCanvasData } from '../hooks/useCanvasData';
import { useInspector } from '../hooks/useInspector';
import { useSelectionSync } from '../hooks/useSelectionSync';
import { usePanZoom, type Tool } from '../hooks/usePanZoom';
import { InspectionOutline } from '../inspector/InspectionOutline';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { togglePlaying } from '../lib/play';
import type { Bounds } from '../../shared/types';
import { useArtboardPage } from '../hooks/useArtboardPage';

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

type ArtboardViewProps = Omit<ReturnType<typeof useCanvasData>, 'live' | 'stale' | 'send'> & {
  id: string;
  artifact: string | null;
  live?: boolean;
  send?: (message: SelectionMessage) => void;
};

export function ArtboardLayout({ id }: { id: string }) {
  const data = useCanvasData(id);
  return <ArtboardView id={id} artifact={`artboard/${id}`} {...data} />;
}

export function ArtboardView({ id, artifact, canvas, layout, warnings, pending, contentBase, versions, live, loaded, send, agent }: ArtboardViewProps) {
  const [tool, setTool] = useState<Tool>('select');
  const { viewportRef, view, fit, zoomBy, zoomTo, cursor, handlers, panBy, wheelAt, panning, setSpaceHeld } = usePanZoom(tool);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const pageBounds = (id: string | null) => (id && layout?.pages[id]?.bounds) || null;
  const fitPage = useCallback((id: string) => {
    const bounds = layout?.pages[id]?.bounds;
    if (!bounds) return false;
    fit(bounds);
    return true;
  }, [layout, fit]);
  const fitFocus = useCallback((_target: string, resolved: { bounds: Bounds }) => fit(resolved.bounds), [fit]);
  const { page, changePage } = useArtboardPage({ canvas, layout, fitPage, fitFocus });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [playing, setPlaying] = useState<ReadonlySet<string>>(() => new Set());
  const [replays, setReplays] = useState<Record<string, number>>({});
  const gesture = useRef<{ x: number; y: number; append: boolean; moved: boolean; frame?: { boardId: string; id: number } } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [marquee, setMarquee] = useState<InspectorRect | null>(null);
  const selectionEnabled = tool === 'select' && !expanded && !panning;
  const inspector = useInspector({
    enabled: !expanded && (tool === 'select' || inspectorOpen),
    playing,
    onInput: (boardId, input) => {
      const board = canvas?.boards[boardId];
      if (!board) return;
      if (input.type === 'ryugi:inspect:wheel') wheelAt({ ...input, x: view.x + (board.x + input.x) * view.k, y: view.y + (board.y + input.y) * view.k });
      else if (input.type === 'ryugi:inspect:pan') panBy(input.deltaX, input.deltaY);
      else if (input.type === 'ryugi:inspect:drag') {
        if (selectionEnabled) dragSelection(input.phase, board.x + input.x, board.y + input.y, input.append, input.id ? { boardId, id: input.id } : undefined);
      }
      else if (input.code === 'Space') setSpaceHeld(input.down);
      else if (input.down) onKey(input);
    },
  });
  useSelectionSync({ artifact, boards: canvas?.boards, live, inspector, send });
  const retained = useMemo(() => new Set([
    ...inspector.selectedTargets.map((target) => target.boardId),
    ...Object.entries(inspector.frames).filter(([, frame]) => frame.tweaks.length > 0).map(([id]) => id),
  ]), [inspector.selectedTargets, inspector.frames]);
  const closeInspector = useCallback(() => setInspectorOpen(false), []);
  useEffect(() => { if (expanded) setSpaceHeld(false); }, [expanded, setSpaceHeld]);
  useEffect(() => { gesture.current = null; setMarquee(null); setSelecting(false); inspector.cancelDrag(); }, [tool, expanded, page, panning, inspector.cancelDrag]);
  const pendingBoards = useMemo(() => new Set(pending), [pending]);

  const pages = canvas?.pages ?? [];

  useEffect(() => {
    document.title = canvas?.title || id;
  }, [canvas?.title, id]);
  function onKey(e: KeyboardEvent | Extract<InspectorReport, { type: 'ryugi:inspect:key' }>) {
    if ('target' in e && (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="tree"], [role="treeitem"]')) return;
    const prevent = () => { if ('preventDefault' in e) e.preventDefault(); };
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') { setExpanded(null); inspector.clearSelection(); gesture.current = null; setMarquee(null); setSelecting(false); inspector.cancelDrag(); }
    else if (mod && (e.key === '=' || e.key === '+')) { prevent(); zoomBy(1.25); }
    else if (mod && e.key === '-') { prevent(); zoomBy(0.8); }
    else if (e.shiftKey && e.code === 'Digit1') fit(pageBounds(page));
    else if (e.shiftKey && e.code === 'Digit0') zoomTo(1);
    else if (!mod && !e.shiftKey && e.key.toLowerCase() === 'v') setTool('select');
    else if (!mod && !e.shiftKey && e.key.toLowerCase() === 'h') setTool('hand');
  }

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const allBoards = canvas?.boards ?? {};
  const boards = useMemo(() => Object.entries(canvas?.boards ?? {}).filter(([, b]) => b.page === page), [canvas, page]);
  const groups = Object.entries(canvas?.groups ?? {}).filter(([, g]) =>
    g.boards.some((id) => allBoards[id]?.page === page),
  );
  const notes = Object.entries(canvas?.notes ?? {}).filter(([, n]) => n.page === page);
  const expandedBoard = expanded ? allBoards[expanded] : undefined;
  const expandedReady = expandedBoard
    ? (versions[expandedBoard.file] ?? 0) > 0 && !pendingBoards.has(expanded!)
    : false;

  const areasFor = useCallback((rect: InspectorRect) => boards.flatMap(([boardId, board]) => {
    const left = Math.max(rect.x, board.x), top = Math.max(rect.y, board.y);
    const right = Math.min(rect.x + rect.width, board.x + board.w), bottom = Math.min(rect.y + rect.height, board.y + board.h);
    return right > left && bottom > top ? [{ boardId, rect: { x: left - board.x, y: top - board.y, width: right - left, height: bottom - top } }] : [];
  }), [boards]);

  function dragSelection(phase: 'start' | 'move' | 'end' | 'cancel', x: number, y: number, append = false, frame?: { boardId: string; id: number }) {
    if (phase === 'start') { gesture.current = { x, y, append, moved: false, frame }; setMarquee(null); setSelecting(true); inspector.beginArea(); return; }
    const start = gesture.current;
    if (!start) return;
    const rect = { x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
    if (Math.hypot(rect.width, rect.height) * view.k >= 3) start.moved = true;
    if (phase === 'move') { if (start.moved) { setMarquee(rect); inspector.selectArea(areasFor(rect), start.append, true); } return; }
    gesture.current = null; setMarquee(null); setSelecting(false);
    if (phase === 'cancel' || !start.moved) inspector.cancelDrag();
    if (phase === 'cancel') return;
    if (!start.moved) {
      if (start.frame) inspector.select(start.frame.boardId, start.frame.id, start.append);
      else if (!start.append) inspector.clearSelection();
      return;
    }
    inspector.selectArea(areasFor(rect), start.append);
    inspector.cancelDrag();
  }
  const worldPoint = (event: { clientX: number; clientY: number }) => {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left - view.x) / view.k, y: (event.clientY - rect.top - view.y) / view.k };
  };

  return (
    <div {...stylex.props(styles.layout)}>
    <div ref={viewportRef} {...stylex.props(styles.viewport)} style={{ cursor }}
      onPointerDown={(event) => {
        handlers.onPointerDown(event);
        if (!selectionEnabled || event.pointerType === 'touch' || event.button !== 0 || !event.currentTarget.contains(event.target as Node) || (event.target as Element).closest('[data-chrome]')) return;
        const point = worldPoint(event);
        event.currentTarget.setPointerCapture(event.pointerId);
        dragSelection('start', point.x, point.y, event.shiftKey || event.metaKey || event.ctrlKey);
      }}
      onPointerMove={(event) => { handlers.onPointerMove(event); if (gesture.current) { if (event.buttons === 1) event.currentTarget.setPointerCapture(event.pointerId); const point = worldPoint(event); dragSelection('move', point.x, point.y); } }}
      onPointerUp={(event) => { handlers.onPointerUp(event); if (gesture.current) { const point = worldPoint(event); dragSelection('end', point.x, point.y); } }}
      onPointerCancel={(event) => { handlers.onPointerCancel(event); gesture.current = null; setMarquee(null); setSelecting(false); inspector.cancelDrag(); }}>
      {canvas && layout && (
        <CanvasErrorBoundary resetKey={canvas}>
          <Canvas
            view={view}
            boards={boards}
            notes={notes}
            contentBase={contentBase}
            versions={versions}
            pending={pendingBoards}
            playing={playing}
            replays={replays}
            inspecting={selectionEnabled}
            frameRef={inspector.refFor}
            frameLoaded={inspector.loaded}
            writing={live ? canvas.writing : undefined}
            agent={agent}
            retained={retained}
          />
          <Labels
            view={view}
            boards={boards}
            groups={groups}
            allBoards={allBoards}
            contentBase={contentBase}
            versions={versions}
            pending={pendingBoards}
            playing={playing}
            onExpand={setExpanded}
            onTogglePlay={(id) => setPlaying((current) => togglePlaying(current, id))}
            onReplay={(id) => setReplays((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))}
          />
        </CanvasErrorBoundary>
      )}
      {selectionEnabled && !marquee && inspector.hover && allBoards[inspector.hover.boardId] && <InspectionOutline board={allBoards[inspector.hover.boardId]!} rect={inspector.hover.rect} view={view} nodeId={inspector.hover.id ? `${inspector.hover.boardId}#${inspector.hover.id}` : undefined} />}
      {!expanded && inspector.targets.map((target) => allBoards[target.boardId] && <InspectionOutline key={`${target.boardId}:${target.id}`} board={allBoards[target.boardId]!} rect={target.rect} view={view} name={target.name} selected />)}
      {selecting && <div className="ri-selection-capture" aria-hidden="true" />}
      {marquee && <div className="ri-marquee" aria-hidden="true" style={{ left: view.x + marquee.x * view.k, top: view.y + marquee.y * view.k, width: marquee.width * view.k, height: marquee.height * view.k }} />}
      {(!canvas || !layout) && (
        <div {...stylex.props(styles.empty)}>
          {loaded ? (warnings[0] ?? 'Waiting for the agent to write canvas.json…') : 'Connecting…'}
        </div>
      )}
      <TopLeftBar pages={pages} page={page} onPageChange={changePage} tool={tool} onToolChange={setTool} />
      <TopRightBar
        artifact={artifact}
        live={live}
        warnings={warnings}
        zoom={view.k}
        onZoomIn={() => zoomBy(1.25)}
        onZoomOut={() => zoomBy(0.8)}
        onFit={() => fit(pageBounds(page))}
        onActualSize={() => zoomTo(1)}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((open) => !open)}
      />
      {expanded && expandedBoard && expandedReady && (
        <ExpandedBoard
          id={expanded}
          board={expandedBoard}
          src={`${contentBase}${expandedBoard.file}?v=${versions[expandedBoard.file] ?? 0}`}
          interactive={expandedBoard.interactive === true}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
    {inspectorOpen && <InspectorPanel boards={boards} frames={inspector.frames} selection={inspector.selection} targets={inspector.targets} select={inspector.select} hoverNode={inspector.hoverNode} change={inspector.change} reset={inspector.reset} playing={playing} enabled={!expanded} onClose={closeInspector} />}
    </div>
  );
}
