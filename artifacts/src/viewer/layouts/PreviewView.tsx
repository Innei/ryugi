import * as stylex from '@stylexjs/stylex';
import type { SerializedEditorState } from 'lexical';
import { lazy, Suspense, useEffect, useState } from 'react';

import type { ArtifactType, CanvasPayload } from '../../shared/types';
import { CanvasErrorBoundary } from '../components/CanvasErrorBoundary';
import { useTranslation } from '../i18n';
import { culledBoards } from '../lib/cull';
import { fitView } from '../lib/view';
import { styles } from './previewStyles';

const DocumentPreview = lazy(() =>
  import('../document/shims').then(() => import('../document/SnapshotDocument')),
);
const CanvasPreview = lazy(() =>
  import('../components/Canvas').then(({ Canvas }) => ({ default: Canvas })),
);
const noRef = () => () => {};
const noLoad = () => {};
const none = new Set<string>();

export interface PreviewPayload extends Partial<CanvasPayload> {
  contentBase: string;
  state?: SerializedEditorState;
  title: string;
}

export function PreviewView({
  type,
  id,
  data,
  failed,
}: {
  type: ArtifactType;
  id: string;
  data: PreviewPayload | null;
  failed: boolean;
}) {
  const { t } = useTranslation();
  const [viewport, setViewport] = useState(() => ({ width: innerWidth, height: innerHeight }));
  useEffect(() => {
    const resize = () => setViewport({ width: innerWidth, height: innerHeight });
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);

  const message = (text: string) => <div {...stylex.props(styles.message)}>{text}</div>;
  if (failed) return message(t('preview.unavailable'));
  if (!data) return message(t('preview.loading'));
  if (type === 'html') {
    if (data.warnings?.length) return message(t('preview.waitingPage'));
    return (
      <iframe
        {...stylex.props(styles.html)}
        sandbox="allow-scripts"
        src={`${data.contentBase}index.html`}
        tabIndex={-1}
        title={data.title}
      />
    );
  }
  if (type === 'document') {
    return data.state ? (
      <CanvasErrorBoundary resetKey={data.state}>
        <Suspense fallback={message(t('preview.loading'))}>
          <DocumentPreview contentBase={data.contentBase} id={id} state={data.state} />
        </Suspense>
      </CanvasErrorBoundary>
    ) : (
      message(t('preview.waitingDocument'))
    );
  }
  const canvas = data.canvas;
  const page = canvas?.activePage ?? canvas?.pages[0]?.id;
  const bounds = page ? data.layout?.pages[page]?.bounds : null;
  if (!canvas || !page || !bounds) return message(t('preview.waitingCanvas'));
  const view = fitView(bounds, viewport, { top: 24, right: 24, bottom: 24, left: 24 });
  const boards = Object.entries(canvas.boards).filter(([, board]) => board.page === page);
  return (
    <div {...stylex.props(styles.canvas)}>
      <CanvasErrorBoundary resetKey={canvas}>
        <Suspense fallback={message(t('preview.loading'))}>
          <CanvasPreview
            boards={boards}
            contentBase={data.contentBase}
            frameLoaded={noLoad}
            frameRef={noRef}
            inspecting={false}
            notes={Object.entries(canvas.notes ?? {}).filter(([, note]) => note.page === page)}
            pending={new Set(data.pending)}
            playing={none}
            replays={{}}
            versions={data.versions ?? {}}
            view={view}
            culled={culledBoards(
              boards.map(([board, spec]) => ({ id: board, ...spec })),
              view,
              viewport,
            )}
          />
        </Suspense>
      </CanvasErrorBoundary>
    </div>
  );
}
