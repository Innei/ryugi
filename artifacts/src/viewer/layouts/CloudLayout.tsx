import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import type { SerializedEditorState } from 'lexical';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { CommentsFile } from '../../shared/comments';
import type { CanvasPayload } from '../../shared/types';
import { HTML_SANDBOX } from '../hooks/useSandboxFrame';
import { ArtboardView } from './ArtboardLayout';

const CloudDocument = lazy(() => import('../document/shims').then(() => import('../document/CloudDocument')));
const CloudLiveDocument = lazy(() => import('../document/shims').then(() => import('../document/CloudLiveDocument')));

const styles = stylex.create({
  frame: { position: 'fixed', inset: 0, display: 'block', width: '100%', height: '100%', borderWidth: 0 },
  message: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: '100%',
    padding: 24,
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 14,
    textAlign: 'center',
  },
});

type CloudArtifact =
  | { type: 'html'; title: string; contentBase: string; payload: { title: string } }
  | { type: 'artboard'; title: string; contentBase: string; payload: Pick<CanvasPayload, 'canvas' | 'layout' | 'versions'> }
  | { type: 'document'; title: string; contentBase: string; owner?: boolean; payload: { title: string; state: SerializedEditorState; comments?: CommentsFile } };

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
    if (state.status === 'ready') document.title = state.artifact.title;
  }, [state]);

  if (state.status === 'loading') return <div {...stylex.props(styles.message)}>正在加载…</div>;
  if (state.status === 'failed') return <div {...stylex.props(styles.message)}>{state.message}</div>;
  if (state.status === 'missing') return <div {...stylex.props(styles.message)}>这个链接打不开</div>;

  const { artifact } = state;
  if (artifact.type === 'html') {
    return <iframe title={artifact.title} src={`${artifact.contentBase}index.html`} sandbox={HTML_SANDBOX} allow="clipboard-write" {...stylex.props(styles.frame)} />;
  }
  if (artifact.type === 'artboard') {
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
  const Document = artifact.owner === true ? CloudLiveDocument : CloudDocument;
  return (
    <Suspense fallback={null}>
      <Document id={id} state={artifact.payload.state} contentBase={artifact.contentBase} comments={artifact.payload.comments} />
    </Suspense>
  );
}
