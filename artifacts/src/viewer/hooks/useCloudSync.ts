import { useCallback, useEffect, useState } from 'react';

import { onServerMessage } from './useArtifactSocket';
import { cloudRequest } from './useCloudStatus';

const SETTLE_MS = 800;

export function useCloudSync(artifact: string, enabled: boolean) {
  const [upToDate, setUpToDate] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const result = await cloudRequest('GET', `sync/${artifact}`);
    if (result.ok)
      setUpToDate(typeof result.json.upToDate === 'boolean' ? result.json.upToDate : null);
  }, [artifact, enabled]);

  useEffect(() => {
    if (!enabled) {
      setUpToDate(null);
      return;
    }
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onServerMessage((message) => {
      if (
        message.artifact !== artifact ||
        (message.type !== 'change' && message.type !== 'cloud-published')
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), SETTLE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [artifact, enabled, refresh]);

  return { upToDate, refresh };
}
