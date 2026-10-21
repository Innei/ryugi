import type { SerializedEditorState } from 'lexical';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { ArtifactType, CanvasPayload } from '../../shared/types';
import { Canvas } from '../components/Canvas';
import { CanvasErrorBoundary } from '../components/CanvasErrorBoundary';
import { cloudPreviewPayload, type CloudArtifactData } from '../lib/cloud-list';
import { fitView } from '../lib/view';

const DocumentPreview = lazy(() => import('../document/shims').then(() => import('../document/CloudDocument')));
const noRef = () => () => {};
const noLoad = () => {};
const none = new Set<string>();

interface Payload extends Partial<CanvasPayload> {
  title: string;
  contentBase: string;
  state?: SerializedEditorState;
}

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
  const { data, failed } = useJson<Payload>(`/api/preview/${type}/${id}`);
  return <PreviewView type={type} id={id} data={data} failed={failed} />;
}

export function CloudPreviewLayout({ id }: { id: string }) {
  const { data, failed } = useJson<CloudArtifactData>(`/api/a/${id}`);
  const payload = useMemo(() => (data ? cloudPreviewPayload(data) : null), [data]);
  return <PreviewView type={data?.type ?? 'html'} id={id} data={payload} failed={failed} />;
}

function PreviewView({ type, id, data, failed }: { type: ArtifactType; id: string; data: Payload | null; failed: boolean }) {
  const [viewport, setViewport] = useState(() => ({ width: innerWidth, height: innerHeight }));
  useEffect(() => {
    const resize = () => setViewport({ width: innerWidth, height: innerHeight });
    addEventListener('resize', resize);
    return () => removeEventListener('resize', resize);
  }, []);

  const message = (text: string) => <div className="artifact-preview-message">{text}</div>;
  if (failed) return message('预览暂不可用');
  if (!data) return message('正在加载预览…');
  if (type === 'html') {
    if (data.warnings?.length) return message('等待页面内容…');
    return <iframe className="artifact-preview-html" title={data.title} src={`${data.contentBase}index.html`} sandbox="allow-scripts" tabIndex={-1} />;
  }
  if (type === 'document') {
    return data.state ? (
      <CanvasErrorBoundary resetKey={data.state}>
        <Suspense fallback={message('正在加载预览…')}>
          <DocumentPreview id={id} state={data.state} contentBase={data.contentBase} />
        </Suspense>
      </CanvasErrorBoundary>
    ) : message('等待文档内容…');
  }
  const canvas = data.canvas;
  const page = canvas?.activePage ?? canvas?.pages[0]?.id;
  const bounds = page ? data.layout?.pages[page]?.bounds : null;
  if (!canvas || !page || !bounds) return message('等待画布内容…');
  return (
    <div className="artifact-preview-canvas">
      <CanvasErrorBoundary resetKey={canvas}>
        <Canvas
          view={fitView(bounds, viewport, { top: 24, right: 24, bottom: 24, left: 24 })}
          boards={Object.entries(canvas.boards).filter(([, board]) => board.page === page)}
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
      </CanvasErrorBoundary>
    </div>
  );
}
