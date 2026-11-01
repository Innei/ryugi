import { useCallback, useEffect, useState } from 'react';

import type { HubArtifactList } from '../../../shared/hub';
import { useArtifactSocket } from '../../hooks/useArtifactSocket';

const REFRESH_MS = 10000;

export function useHubArtifacts() {
  const [list, setList] = useState<HubArtifactList | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/hub/artifacts', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      setList((await response.json()) as HubArtifactList);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  const { live } = useArtifactSocket((message) => {
    if (message.type === 'change') void refresh();
  }, refresh);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const removeProject = useCallback(
    async (dir: string) => {
      const response = await fetch('/api/hub/projects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dir }),
      });
      if (!response.ok) throw new Error(String(response.status));
      await refresh();
    },
    [refresh],
  );

  return { list, error, live, refresh, removeProject };
}
