import './preview.css';
import type { SerializedEditorState } from 'lexical';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { ArtifactType, CanvasPayload } from '../../shared/types';
import { CanvasErrorBoundary } from '../components/CanvasErrorBoundary';
import { useTranslation } from '../i18n';
import { visibleRenders } from '../lib/board-tiers';
import { fitView } from '../lib/view';

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
  title: string;
  contentBase: string;
  state?: SerializedEditorState;
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

  const message = (text: string) => <div className="artifact-preview-message">{text}</div>;
  if (failed) return message(t('preview.unavailable'));
  if (!data) return message(t('preview.loading'));
  if (type === 'html') {
    if (data.warnings?.length) return message(t('preview.waitingPage'));
    return (
      <iframe
        className="artifact-preview-html"
        title={data.title}
        src={`${data.contentBase}index.html`}
        sandbox="allow-scripts"
        tabIndex={-1}
      />
    );
  }
  if (type === 'document') {
    return data.state ? (
      <CanvasErrorBoundary resetKey={data.state}>
        <Suspense fallback={message(t('preview.loading'))}>
          <DocumentPreview id={id} state={data.state} contentBase={data.contentBase} />
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
    <div className="artifact-preview-canvas">
      <CanvasErrorBoundary resetKey={canvas}>
        <Suspense fallback={message(t('preview.loading'))}>
          <CanvasPreview
            view={view}
            renders={visibleRenders({
              boards: boards.map(([id, board]) => ({ id, ...board })),
              view,
              viewport,
            })}
            boards={boards}
            notes={Object.entries(canvas.notes ?? {}).filter(([, note]) => note.page === page)}
            contentBase={data.contentBase}
            versions={data.versions ?? {}}
            pending={new Set(data.pending)}
            playing={none}
            replays={{}}
            inspecting={false}
            frameRef={noRef}
            frameLoaded={noLoad}
          />
        </Suspense>
      </CanvasErrorBoundary>
    </div>
  );
}
