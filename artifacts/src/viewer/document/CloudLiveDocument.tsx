import type { SerializedEditorState } from 'lexical';
import { useEffect, useState } from 'react';
import type { CommentsFile } from '../../shared/comments';
import { VIEWER_VERSION } from '../lib/version';
import CloudDocument from './CloudDocument';
import { editableAcross, versionReason } from './cloudLive';
import { DocumentView } from './DocumentPage';
import { useRelayTransport } from './useDocumentTransport';

interface Props {
  id: string;
  state: SerializedEditorState;
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
    return <CloudDocument id={id} state={state} contentBase={contentBase} comments={comments} offline={presence !== null && !online} />;
  }
  const canEdit = online && editableAcross(VIEWER_VERSION, presence?.version ?? null);
  const reason = online && !canEdit ? versionReason(VIEWER_VERSION, presence?.version ?? null) : null;
  return <DocumentView id={id} transport={transport} live={online} cloud={{ online, canEdit, reason }} />;
}
