import { useEffect, useState } from 'react';

import type { HtmlPayload } from '../../shared/types';
import type { ArtifactFeed } from '../lib/feed';

export interface HtmlViewerPayload extends HtmlPayload {
  contentBase: string;
  found: boolean;
}

export function useHtmlData(id: string, { live, revision, load, send }: ArtifactFeed) {
  const [data, setData] = useState<HtmlViewerPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then(
      ({ found, data: next }) => {
        if (cancelled) return;
        const payload = next as Partial<HtmlViewerPayload>;
        setData({
          title: payload.title ?? id,
          warnings: payload.warnings ?? [],
          version: payload.version ?? 0,
          contentBase: payload.contentBase ?? '',
          found,
        });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [id, load, revision]);

  return { data, live, send };
}
