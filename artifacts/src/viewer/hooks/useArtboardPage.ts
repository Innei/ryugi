import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bounds, CanvasLayout, CanvasSpec } from '../../shared/types';
import { resolveFocus } from '../lib/view';
import { usePageQuery } from './usePageQuery';

interface Options {
  canvas: CanvasSpec | null | undefined;
  layout: CanvasLayout | null | undefined;
  fitPage: (page: string) => boolean;
  fitFocus: (target: string, resolved: { page: string; bounds: Bounds }) => void;
  startAtFocus?: boolean;
}

export function useArtboardPage({ canvas, layout, fitPage, fitFocus, startAtFocus = false }: Options) {
  const [page, setPage] = useState<string | null>(null);
  const seenActivePage = useRef<string | undefined>(undefined);
  const seenFocusAt = useRef<string | undefined>(undefined);
  const pendingFit = useRef<string | null>(null);
  const initialized = useRef(false);
  const [requested, writePage] = usePageQuery();
  const seenRequested = useRef(requested);
  const selectPage = useCallback((id: string | null, replace = true) => {
    setPage(id);
    pendingFit.current = id;
    seenRequested.current = id;
    writePage(id, replace);
  }, [writePage]);

  useEffect(() => {
    if (!canvas || !layout) return;
    const firstPage = canvas.pages[0]?.id ?? null;
    const valid = (id: string | null | undefined) => id && canvas.pages.some((p) => p.id === id) ? id : null;

    if (!initialized.current) {
      initialized.current = true;
      seenActivePage.current = canvas.activePage;
      seenFocusAt.current = canvas.focus?.at;
      const focused = startAtFocus && canvas.focus ? resolveFocus(canvas, layout, canvas.focus.target)?.page : undefined;
      const start = valid(requested) ?? (requested !== null ? firstPage : valid(focused) ?? valid(canvas.activePage) ?? firstPage);
      selectPage(start);
      return;
    }

    if (requested !== seenRequested.current) {
      seenFocusAt.current = canvas.focus?.at;
      seenActivePage.current = canvas.activePage;
      selectPage(valid(requested) ?? firstPage);
      return;
    }

    const focus = canvas.focus;
    if (focus && focus.at !== seenFocusAt.current) {
      seenFocusAt.current = focus.at;
      seenActivePage.current = canvas.activePage;
      const target = resolveFocus(canvas, layout, focus.target);
      if (target) {
        setPage(target.page);
        pendingFit.current = null;
        seenRequested.current = target.page;
        writePage(target.page, true);
        fitFocus(focus.target, target);
        return;
      }
    }

    if (canvas.activePage !== seenActivePage.current) {
      seenActivePage.current = canvas.activePage;
      if (canvas.activePage) {
        selectPage(valid(canvas.activePage) ?? firstPage);
        return;
      }
    }

    if (!page || !canvas.pages.some((p) => p.id === page)) {
      selectPage(firstPage);
    }
  }, [canvas, layout, fitFocus, page, startAtFocus, requested, selectPage, writePage]);

  useEffect(() => {
    if (pendingFit.current === null || pendingFit.current !== page) return;
    if (!fitPage(page)) return;
    pendingFit.current = null;
  });

  const changePage = (id: string) => {
    if (canvas?.pages.some((p) => p.id === id)) selectPage(id, false);
  };

  return { page, changePage };
}
