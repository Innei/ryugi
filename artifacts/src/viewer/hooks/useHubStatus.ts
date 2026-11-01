import { useCallback, useEffect, useState } from 'react';

import type { HubStatus } from '../../shared/hub';

export const HUB_STATUS_POLL_MS = 5000;

export function useHubStatus(enabled = true) {
  const [status, setStatus] = useState<HubStatus | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setStatus((await res.json()) as HubStatus);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = setInterval(() => void refresh(), HUB_STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, refresh]);

  return { status, offline, refresh };
}
