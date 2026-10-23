import { lazy, Suspense, useEffect, useState } from 'react';
import { useTypeFavicon } from '../hooks/useTypeFavicon';
import { CloudLiveArtifact } from './CloudLiveLayout';
import { CloudMessage } from './CloudMessage';
import { CloudSnapshot, type CloudArtifact } from './CloudSnapshot';

const CloudDocument = lazy(() => import('../document/shims').then(() => import('../document/CloudDocument')));

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; artifact: CloudArtifact };

export function CloudLayout({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/a/${id}`, { cache: 'no-store', credentials: 'same-origin' });
        if (cancelled) return;
        if (res.status === 404) setState({ status: 'missing' });
        else if (!res.ok) setState({ status: 'failed', message: `加载失败（${res.status}）` });
        else setState({ status: 'ready', artifact: (await res.json()) as CloudArtifact });
      } catch (err) {
        if (!cancelled) setState({ status: 'failed', message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (state.status === 'ready' && state.artifact.title) document.title = state.artifact.title;
  }, [state]);
  useTypeFavicon(state.status === 'ready' ? state.artifact.type : null);

  if (state.status === 'loading') return <CloudMessage>正在加载…</CloudMessage>;
  if (state.status === 'failed') return <CloudMessage>{state.message}</CloudMessage>;
  if (state.status === 'missing') return <CloudMessage>这个链接打不开</CloudMessage>;

  const { artifact } = state;
  if (artifact.owner === true && artifact.liveContentBase) return <CloudLiveArtifact id={id} artifact={{ ...artifact, liveContentBase: artifact.liveContentBase }} />;
  if (artifact.type !== 'document') return <CloudSnapshot id={id} artifact={artifact} />;
  if (!artifact.payload || !artifact.contentBase) return <CloudMessage>这个链接打不开</CloudMessage>;
  return (
    <Suspense fallback={null}>
      <CloudDocument id={id} state={artifact.payload.state} contentBase={artifact.contentBase} comments={artifact.payload.comments} />
    </Suspense>
  );
}
