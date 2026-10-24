import { useEffect, useState } from 'react';
import { readPublication, type Publication } from '../../shared/cloud';
import { onServerMessage } from './useArtifactSocket';
import { cloudRequest } from './useCloudStatus';

export function usePublication(artifact: string, enabled: boolean) {
  const [publication, setPublication] = useState<Publication | null>(null);
  useEffect(() => {
    if (!enabled) { setPublication(null); return; }
    let cancelled = false;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      const result = await cloudRequest('GET', `publication/${artifact}`);
      const next = result.ok && readPublication(result.json);
      if (!cancelled && current === revision && next) setPublication(next);
    };
    void refresh();
    const unsubscribe = onServerMessage((event) => {
      if (event.artifact !== artifact) return;
      if (event.type === 'cloud-publication') { revision++; setPublication(event.publication); }
      if (event.type === 'change' || event.type === 'cloud-published') void refresh();
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [artifact, enabled]);
  return publication;
}
