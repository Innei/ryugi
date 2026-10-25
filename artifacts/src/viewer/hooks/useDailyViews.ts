import { useEffect, useState } from 'react';
import { isDailyViews, type DailyViews } from '../lib/cloud-list';

export function useDailyViews(id: string, enabled: boolean) {
  const [views, setViews] = useState<DailyViews | null>(null);
  useEffect(() => {
    setViews(null);
    if (!enabled) return;
    let live = true;
    fetch(`/api/account/artifacts/${encodeURIComponent(id)}/views`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => (res.ok ? res.json() : null))
      .then((body: unknown) => live && setViews(isDailyViews(body) ? body : null))
      .catch(() => live && setViews(null));
    return () => {
      live = false;
    };
  }, [id, enabled]);
  return views;
}
