import { useEffect, useState } from 'react';
import { boardCommentsFromPayload, type BoardCommentsState } from '../lib/board-comments';
import { mergePayload, type ViewerPayload } from '../lib/payload';
import type { ArtifactFeed } from '../lib/feed';

const EMPTY: ViewerPayload = { canvas: null, warnings: [], pending: [], layout: null, versions: {}, contentBase: '', stale: false };

export function useCanvasData({ live, revision, load, send, boardComments, comment }: ArtifactFeed) {
  const [data, setData] = useState<ViewerPayload>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [comments, setComments] = useState<BoardCommentsState | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then(
      ({ data: next }) => {
        if (cancelled) return;
        setData((prev) => mergePayload(prev, { ...EMPTY, ...(next as Partial<ViewerPayload>) }));
        const fromPayload = boardCommentsFromPayload(next);
        if (fromPayload) setComments(fromPayload);
        setLoaded(true);
      },
      () => !cancelled && setLoaded(true),
    );
    return () => {
      cancelled = true;
    };
  }, [load, revision]);

  useEffect(() => {
    if (boardComments) setComments(boardComments);
  }, [boardComments]);

  return { ...data, loaded, live, send, comments, comment };
}
