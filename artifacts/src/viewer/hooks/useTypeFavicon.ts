import { useEffect } from 'react';

import { typeFaviconHref } from '../../shared/type-icons';
import type { ArtifactType } from '../../shared/types';

export function useTypeFavicon(type: ArtifactType | null | undefined) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link || !type) return;
    const previous = link.href;
    link.href = typeFaviconHref(type);
    return () => {
      link.href = previous;
    };
  }, [type]);
}
