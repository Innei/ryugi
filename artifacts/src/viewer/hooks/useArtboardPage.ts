import { useCallback, useEffect, useRef, useState } from 'react';

import type { CanvasLayout, CanvasSpec } from '../../shared/types';
import { resolveFocus } from '../lib/view';
import { usePageQuery } from './usePageQuery';

interface Options {
  canvas: CanvasSpec | null | undefined;
  fitPage: (page: string) => boolean;
  layout: CanvasLayout | null | undefined;
  startAtFocus?: boolean;
}

export function useArtboardPage({ canvas, layout, fitPage, startAtFocus = false }: Options) {
  const [page, setPage] = useState<string | null>(null);
  const pendingFit = useRef<string | null>(null);
  const initialized = useRef(false);
  const [requested, writePage] = usePageQuery();
  const seenRequested = useRef(requested);
  const selectPage = useCallback(
    (id: string | null, replace = true) => {
      setPage(id);
      pendingFit.current = id;
      seenRequested.current = id;
      writePage(id, replace);
    },
    [writePage],
  );

  useEffect(() => {
    if (!canvas || !layout) return;
    const firstPage = canvas.pages[0]?.id ?? null;
    const valid = (id: string | null | undefined) =>
      id && canvas.pages.some((p) => p.id === id) ? id : null;

    if (!initialized.current) {
      initialized.current = true;
      const focused =
        startAtFocus && canvas.focus
          ? resolveFocus(canvas, layout, canvas.focus.target)?.page
          : undefined;
      const start =
        valid(requested) ??
        (requested !== null
          ? firstPage
          : (valid(focused) ?? valid(canvas.activePage) ?? firstPage));
      selectPage(start);
      return;
    }

    if (requested !== seenRequested.current) {
      selectPage(valid(requested) ?? firstPage);
      return;
    }

    // Agent updates supply opening defaults; navigation and the camera belong to this viewer.
    if (!page || !canvas.pages.some((p) => p.id === page)) {
      selectPage(firstPage);
    }
  }, [canvas, layout, page, startAtFocus, requested, selectPage]);

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
