import { useCallback, useEffect, useState } from 'react';
import type { HtmlPayload } from '../../shared/types';
import { useArtifactSocket } from './useArtifactSocket';

export interface HtmlViewerPayload extends HtmlPayload {
  contentBase: string;
  found: boolean;
}

export function useHtmlData(id: string) {
  const [data, setData] = useState<HtmlViewerPayload | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/artifacts/html/${id}`, { cache: 'no-store' });
      const next = (await res.json()) as Partial<HtmlViewerPayload>;
      setData({
        title: next.title ?? id,
        warnings: next.warnings ?? [],
        version: next.version ?? 0,
        contentBase: next.contentBase ?? '',
        found: res.ok,
      });
    } catch {
      setData((prev) => prev);
    }
  }, [id]);

  const live = useArtifactSocket((message) => {
    if (message.type === 'change' && message.artifact === `html/${id}`) void refresh();
  }, refresh);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, live };
}
