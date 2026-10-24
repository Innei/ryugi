import type { SerializedEditorState } from 'lexical';
import { useEffect, useState } from 'react';
import type { CommentsFile } from '../../shared/comments';
import { useCloudHeader } from '../hooks/useCloudHeader';
import { VIEWER_VERSION } from '../lib/version';
import { CloudMessage } from '../layouts/CloudMessage';
import CloudDocument from './CloudDocument';
import { editableAcross, versionReason } from './cloudLive';
import { DocumentView } from './DocumentPage';
import { useRelayTransport } from './useDocumentTransport';
import { t } from '../i18n';

interface Props {
  id: string;
  state: SerializedEditorState | null;
  contentBase: string | null;
  liveContentBase?: string;
  comments?: CommentsFile;
}

export default function CloudLiveDocument({ id, state, contentBase, liveContentBase, comments }: Props) {
  const { transport, presence } = useRelayTransport(id, liveContentBase ?? contentBase ?? '');
  const online = presence?.online ?? false;
  useCloudHeader(id, { online: presence?.online ?? null });
  const [wasLive, setWasLive] = useState(false);
  useEffect(() => {
    if (online) setWasLive(true);
  }, [online]);

  const snapshot = state && contentBase ? <CloudDocument id={id} state={state} contentBase={contentBase} comments={comments} offline={presence !== null && !online} /> : null;
  if (!transport || !(wasLive || online)) {
    return snapshot ?? <CloudMessage>{presence === null ? t('common.connecting') : t('document.notPublished')}</CloudMessage>;
  }
  const canEdit = online && editableAcross(VIEWER_VERSION, presence?.version ?? null);
  const reason = online && !canEdit ? versionReason(VIEWER_VERSION, presence?.version ?? null) : null;
  return <DocumentView id={id} transport={transport} live={online} cloud={{ online, canEdit, reason }} fallback={snapshot} />;
}
