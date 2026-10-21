import type { SerializedEditorState } from 'lexical';
import { useEffect, useState } from 'react';
import type { CommentsFile } from '../../shared/comments';
import { VIEWER_VERSION } from '../lib/version';
import { CloudMessage } from '../layouts/CloudMessage';
import CloudDocument from './CloudDocument';
import { editableAcross, versionReason } from './cloudLive';
import { DocumentView } from './DocumentPage';
import { useRelayTransport } from './useDocumentTransport';

interface Props {
  id: string;
  state: SerializedEditorState | null;
  contentBase: string;
  comments?: CommentsFile;
}

export default function CloudLiveDocument({ id, state, contentBase, comments }: Props) {
  const { transport, presence } = useRelayTransport(id, contentBase);
  const online = presence?.online ?? false;
  const [wasLive, setWasLive] = useState(false);
  useEffect(() => {
    if (online) setWasLive(true);
  }, [online]);

  if (!transport || !(wasLive || online)) {
    if (!state) return <CloudMessage>{presence === null ? '正在连接…' : '还没发布。电脑在线时，这里会实时显示。'}</CloudMessage>;
    return <CloudDocument id={id} state={state} contentBase={contentBase} comments={comments} offline={presence !== null && !online} />;
  }
  const canEdit = online && editableAcross(VIEWER_VERSION, presence?.version ?? null);
  const reason = online && !canEdit ? versionReason(VIEWER_VERSION, presence?.version ?? null) : null;
  return <DocumentView id={id} transport={transport} live={online} cloud={{ online, canEdit, reason }} />;
}
