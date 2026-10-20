import { useCallback, useEffect, useState } from 'react';
import { mergePayload, type ViewerPayload } from '../lib/payload';
import { useArtifactSocket } from './useArtifactSocket';

const EMPTY: ViewerPayload = { canvas: null, warnings: [], pending: [], layout: null, versions: {}, contentBase: '', stale: false };

export function useCanvasData(id: string) {
  const [data, setData] = useState<ViewerPayload>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/artifacts/artboard/${id}`, { cache: 'no-store' });
      const next = (await res.json()) as Omit<ViewerPayload, 'stale'>;
      setData((prev) => mergePayload(prev, { ...EMPTY, ...next }));
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [id]);

  const { live, send } = useArtifactSocket((message) => {
    if (message.type === 'change' && message.artifact === `artboard/${id}`) void refresh();
  }, refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...data, loaded, live, send };
}
