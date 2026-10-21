import { useEffect, useRef, useState } from 'react';
import type { Bounds, CanvasLayout, CanvasSpec } from '../../shared/types';
import { resolveFocus } from '../lib/view';

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

  useEffect(() => {
    if (!canvas || !layout) return;
    const firstPage = canvas.pages[0]?.id ?? null;

    if (!initialized.current) {
      initialized.current = true;
      seenActivePage.current = canvas.activePage;
      seenFocusAt.current = canvas.focus?.at;
      const focused = startAtFocus && canvas.focus ? resolveFocus(canvas, layout, canvas.focus.target)?.page : undefined;
      const start = focused ?? canvas.activePage ?? firstPage;
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
        fitFocus(focus.target, target);
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
  }, [canvas, layout, fitFocus, page, startAtFocus]);

  useEffect(() => {
    if (pendingFit.current === null || pendingFit.current !== page) return;
    if (!fitPage(page)) return;
    pendingFit.current = null;
  });

  const changePage = (id: string) => {
    setPage(id);
    pendingFit.current = id;
  };

  return { page, changePage };
}
