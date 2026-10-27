import { useCallback, useSyncExternalStore } from 'react';

import { usePageWindow } from '../ViewerContext';

export function pageLink(url: string, page: string | null): string {
  if (page === null) return url;
  const link = new URL(url);
  link.searchParams.set('page', page);
  return link.href;
}

export function usePageQuery() {
  const view = usePageWindow();
  const subscribe = useCallback(
    (notify: () => void) => {
      view.addEventListener('popstate', notify);
      view.addEventListener('ryugi:pagechange', notify);
      return () => {
        view.removeEventListener('popstate', notify);
        view.removeEventListener('ryugi:pagechange', notify);
      };
    },
    [view],
  );
  const page = useSyncExternalStore(subscribe, () =>
    new URLSearchParams(view.location.search).get('page'),
  );
  const write = useCallback(
    (id: string | null, replace: boolean) => {
      const url = new URL(view.location.href);
      if (url.searchParams.get('page') === id) return;
      if (id === null) url.searchParams.delete('page');
      else url.searchParams.set('page', id);
      view.history[replace ? 'replaceState' : 'pushState'](view.history.state, '', url);
      view.dispatchEvent(new Event('ryugi:pagechange'));
    },
    [view],
  );
  return [page, write] as const;
}
