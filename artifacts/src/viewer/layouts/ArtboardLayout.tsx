import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '../components/Canvas';
import { CanvasErrorBoundary } from '../components/CanvasErrorBoundary';
import { ExpandedBoard } from '../components/ExpandedBoard';
import { Labels } from '../components/Labels';
import { TopLeftBar, TopRightBar } from '../components/Toolbar';
import { useCanvasData } from '../hooks/useCanvasData';
import { usePanZoom, type Tool } from '../hooks/usePanZoom';
import { togglePlaying } from '../lib/play';
import { resolveFocus } from '../lib/view';

const styles = stylex.create({
  viewport: {
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

type ArtboardViewProps = Omit<ReturnType<typeof useCanvasData>, 'live' | 'stale'> & {
  id: string;
  artifact: string | null;
  live?: boolean;
};

export function ArtboardLayout({ id }: { id: string }) {
  const data = useCanvasData(id);
  return <ArtboardView id={id} artifact={`artboard/${id}`} {...data} />;
}

export function ArtboardView({ id, artifact, canvas, layout, warnings, pending, contentBase, versions, live, loaded }: ArtboardViewProps) {
  const [tool, setTool] = useState<Tool>('select');
  const { viewportRef, view, fit, zoomBy, zoomTo, cursor, handlers } = usePanZoom(tool);
  const [page, setPage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [playing, setPlaying] = useState<ReadonlySet<string>>(() => new Set());
  const [replays, setReplays] = useState<Record<string, number>>({});
  const pendingBoards = useMemo(() => new Set(pending), [pending]);
  const seenActivePage = useRef<string | undefined>(undefined);
  const seenFocusAt = useRef<string | undefined>(undefined);
  const pendingFit = useRef<string | null>(null);
  const initialized = useRef(false);

  const pages = canvas?.pages ?? [];

  useEffect(() => {
    document.title = canvas?.title || id;
  }, [canvas?.title, id]);
  const pageBounds = (id: string | null) => (id && layout?.pages[id]?.bounds) || null;

  useEffect(() => {
    if (!canvas || !layout) return;
    const firstPage = canvas.pages[0]?.id ?? null;

    if (!initialized.current) {
      initialized.current = true;
      seenActivePage.current = canvas.activePage;
      seenFocusAt.current = canvas.focus?.at;
      const start = canvas.activePage ?? firstPage;
      setPage(start);
      pendingFit.current = start;
      return;
    }

    const focus = canvas.focus;
    if (focus && focus.at !== seenFocusAt.current) {
      seenFocusAt.current = focus.at;
      seenActivePage.current = canvas.activePage;
      const target = resolveFocus(canvas, layout, focus.target);
      if (target) {
        setPage(target.page);
        fit(target.bounds);
        return;
      }
    }

    if (canvas.activePage !== seenActivePage.current) {
      seenActivePage.current = canvas.activePage;
      if (canvas.activePage) {
        setPage(canvas.activePage);
        pendingFit.current = canvas.activePage;
      }
      return;
    }

    if (!page || !canvas.pages.some((p) => p.id === page)) {
      setPage(firstPage);
      pendingFit.current = firstPage;
    }
  }, [canvas, layout, fit, page]);

  useEffect(() => {
    if (pendingFit.current === null || pendingFit.current !== page) return;
    const bounds = pageBounds(page);
    if (!bounds) return;
    pendingFit.current = null;
    fit(bounds);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') setExpanded(null);
      else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomBy(1.25);
      } else if (mod && e.key === '-') {
        e.preventDefault();
        zoomBy(0.8);
      } else if (e.shiftKey && e.code === 'Digit1') fit(pageBounds(page));
      else if (e.shiftKey && e.code === 'Digit0') zoomTo(1);
      else if (!mod && !e.shiftKey && e.key.toLowerCase() === 'v') setTool('select');
      else if (!mod && !e.shiftKey && e.key.toLowerCase() === 'h') setTool('hand');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const allBoards = canvas?.boards ?? {};
  const boards = Object.entries(allBoards).filter(([, b]) => b.page === page);
  const groups = Object.entries(canvas?.groups ?? {}).filter(([, g]) =>
    g.boards.some((id) => allBoards[id]?.page === page),
  );
  const notes = Object.entries(canvas?.notes ?? {}).filter(([, n]) => n.page === page);
  const expandedBoard = expanded ? allBoards[expanded] : undefined;
  const expandedReady = expandedBoard
    ? (versions[expandedBoard.file] ?? 0) > 0 && !pendingBoards.has(expanded!)
    : false;

  const changePage = (id: string) => {
    setPage(id);
    pendingFit.current = id;
  };

  return (
    <div ref={viewportRef} {...stylex.props(styles.viewport)} style={{ cursor }} {...handlers}>
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
  );
}
