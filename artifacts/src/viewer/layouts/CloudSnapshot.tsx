import * as stylex from '@stylexjs/stylex';
import type { SerializedEditorState } from 'lexical';
import type { CommentsFile } from '../../shared/comments';
import type { CanvasPayload } from '../../shared/types';
import { HTML_SANDBOX } from '../hooks/useSandboxFrame';
import { ArtboardView } from './ArtboardLayout';
import { CloudMessage } from './CloudMessage';
import { useTranslation } from '../i18n';

const styles = stylex.create({
  frame: { position: 'fixed', inset: 0, display: 'block', width: '100%', height: '100%', borderWidth: 0 },
});

interface CloudBase {
  title: string | null;
  owner?: boolean;
  published?: boolean;
  contentBase: string | null;
  liveContentBase?: string | null;
}

export type CloudArtifact =
  | (CloudBase & { type: 'html'; payload: { title: string } | null })
  | (CloudBase & { type: 'artboard'; payload: Pick<CanvasPayload, 'canvas' | 'layout' | 'versions'> | null })
  | (CloudBase & { type: 'document'; payload: { title: string; state: SerializedEditorState; comments?: CommentsFile } | null });

export function CloudSnapshot({ id, artifact }: { id: string; artifact: Exclude<CloudArtifact, { type: 'document' }> }) {
  const { t } = useTranslation();
  if (!artifact.payload || !artifact.contentBase) return <CloudMessage>{t('cloudShell.notPublished')}</CloudMessage>;
  if (artifact.type === 'html') {
    return <iframe title={artifact.title ?? id} src={`${artifact.contentBase}index.html`} sandbox={HTML_SANDBOX} allow="clipboard-write" {...stylex.props(styles.frame)} />;
  }
  const { canvas, layout, versions } = artifact.payload;
  return (
    <ArtboardView
      id={id}
      artifact={null}
      canvas={canvas}
      layout={layout}
      versions={versions}
      warnings={[]}
      pending={[]}
      contentBase={artifact.contentBase}
      loaded
    />
  );
}
