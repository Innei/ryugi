import { useEffect, useMemo, useState } from 'react';
import type { ArtifactType } from '../../shared/types';
import { cloudPreviewPayload, type CloudArtifactData } from '../lib/cloud-list';
import { PreviewView, type PreviewPayload } from './PreviewView';

function useJson<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal, credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error('Preview unavailable');
        return response.json() as Promise<T>;
      })
      .then(setData)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [url]);
  return { data, failed };
}

export function PreviewLayout({ type, id }: { type: ArtifactType; id: string }) {
  const { data, failed } = useJson<PreviewPayload>(`/api/preview/${type}/${id}`);
  return <PreviewView type={type} id={id} data={data} failed={failed} />;
}

export function CloudPreviewLayout({ id }: { id: string }) {
  const { data, failed } = useJson<CloudArtifactData>(`/api/a/${id}`);
  const payload = useMemo(() => (data ? cloudPreviewPayload(data) : null), [data]);
  return <PreviewView type={data?.type ?? 'html'} id={id} data={payload} failed={failed} />;
}
