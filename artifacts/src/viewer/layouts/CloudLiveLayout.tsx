import { lazy, Suspense } from 'react';
import { useCanvasData } from '../hooks/useCanvasData';
import type { ArtifactFeed } from '../hooks/useArtifactFeed';
import { useCloudFeed } from '../hooks/useCloudFeed';
import { ArtboardView } from './ArtboardLayout';
import { CloudMessage } from './CloudMessage';
import { CloudSnapshot, type CloudArtifact } from './CloudSnapshot';
import { HtmlView } from './HtmlLayout';
import { useTranslation } from '../i18n';

const CloudLiveDocument = lazy(() => import('../document/shims').then(() => import('../document/CloudLiveDocument')));

type OwnerArtifact = CloudArtifact & { liveContentBase: string };

function LiveArtboard({ id, feed }: { id: string; feed: ArtifactFeed }) {
  const data = useCanvasData(feed);
  return <ArtboardView id={id} artifact={`artboard/${id}`} {...data} menu={false} />;
}

function LiveFeedArtifact({ id, artifact }: { id: string; artifact: Exclude<OwnerArtifact, { type: 'document' }> }) {
  const { t } = useTranslation();
  const { presence, feed } = useCloudFeed(id, artifact.type, artifact.liveContentBase);
  if (!feed.live) return presence === null && !artifact.payload ? <CloudMessage>{t('common.connecting')}</CloudMessage> : <CloudSnapshot id={id} artifact={artifact} />;
  if (artifact.type === 'html') return <HtmlView id={id} feed={feed} />;
  return <LiveArtboard id={id} feed={feed} />;
}

export function CloudLiveArtifact({ id, artifact }: { id: string; artifact: OwnerArtifact }) {
  if (artifact.type !== 'document') return <LiveFeedArtifact id={id} artifact={artifact} />;
  return (
    <Suspense fallback={null}>
      <CloudLiveDocument
        id={id}
        state={artifact.payload?.state ?? null}
        contentBase={artifact.contentBase}
        liveContentBase={artifact.liveContentBase}
        comments={artifact.payload?.comments}
      />
    </Suspense>
  );
}
