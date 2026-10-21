import { useEffect, useState } from 'react';
import { mergePayload, type ViewerPayload } from '../lib/payload';
import type { ArtifactFeed } from './useArtifactFeed';

const EMPTY: ViewerPayload = { canvas: null, warnings: [], pending: [], layout: null, versions: {}, contentBase: '', stale: false };

export function useCanvasData({ live, revision, load, send }: ArtifactFeed) {
  const [data, setData] = useState<ViewerPayload>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load().then(
      ({ data: next }) => {
        if (cancelled) return;
        setData((prev) => mergePayload(prev, { ...EMPTY, ...(next as Partial<ViewerPayload>) }));
        setLoaded(true);
      },
      () => !cancelled && setLoaded(true),
    );
    return () => {
      cancelled = true;
    };
  }, [load, revision]);

  return { ...data, loaded, live, send };
}
