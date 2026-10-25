import { lazy, Suspense, useEffect, useState } from 'react';
import { useTypeFavicon } from '../hooks/useTypeFavicon';
import { CloudLiveArtifact } from './CloudLiveLayout';
import { CloudMessage } from './CloudMessage';
import { CloudSnapshot, type CloudArtifact } from './CloudSnapshot';
import { i18n, useTranslation } from '../i18n';

const SnapshotDocument = lazy(() => import('../document/shims').then(() => import('../document/SnapshotDocument')));

type LoadState = { status: 'loading' } | { status: 'missing' } | { status: 'failed'; message: string } | { status: 'ready'; artifact: CloudArtifact };

export function CloudLayout({ id }: { id: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/a/${id}`, { cache: 'no-store', credentials: 'same-origin' });
        if (cancelled) return;
        if (res.status === 404) setState({ status: 'missing' });
        else if (!res.ok) setState({ status: 'failed', message: i18n.t('common.loadFailed', { status: res.status }) });
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

  if (state.status === 'loading') return <CloudMessage>{t('common.loading')}</CloudMessage>;
  if (state.status === 'failed') return <CloudMessage>{state.message}</CloudMessage>;
  if (state.status === 'missing') return <CloudMessage>{t('notFound.title')}</CloudMessage>;

  const { artifact } = state;
  if (artifact.owner === true && artifact.liveContentBase) return <CloudLiveArtifact id={id} artifact={{ ...artifact, liveContentBase: artifact.liveContentBase }} />;
  if (artifact.type !== 'document') return <CloudSnapshot id={id} artifact={artifact} />;
  if (!artifact.payload || !artifact.contentBase) return <CloudMessage>{t('notFound.title')}</CloudMessage>;
  return (
    <Suspense fallback={null}>
      <SnapshotDocument id={id} state={artifact.payload.state} contentBase={artifact.contentBase} comments={artifact.payload.comments} />
    </Suspense>
  );
}
