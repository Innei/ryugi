import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { WarningsBadge } from '../components/WarningsBadge';
import { useHtmlData } from '../hooks/useHtmlData';

const styles = stylex.create({
  root: {
    position: 'fixed',
    inset: 0,
    backgroundColor: cssVar.colorBgContainer,
  },
  frame: { display: 'block', width: '100%', height: '100%', borderWidth: 0 },
  message: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 14,
    textAlign: 'center',
  },
});

export const HTML_SANDBOX = 'allow-scripts allow-modals allow-forms allow-popups allow-downloads';

const SNAPSHOT_TIMEOUT_MS = 300;
const MAX_ERRORS_PER_LOAD = 10;

interface FrameMessage {
  type?: string;
  state?: unknown;
  message?: unknown;
}

export function HtmlLayout({ id }: { id: string }) {
  const { data, send } = useHtmlData(id);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const pendingState = useRef<unknown>(null);
  const errorsThisLoad = useRef(0);

  useEffect(() => {
    document.title = data?.title || id;
  }, [data?.title, id]);

  const ready = data?.found && !data.warnings.includes('index.html not found');
  const target = ready ? `${data.contentBase}index.html?v=${data.version}` : null;

  useEffect(() => {
    if (!target || target === src) return;
    const frame = frameRef.current?.contentWindow;
    if (src === null || !frame) {
      setSrc(target);
      return;
    }
    let done = false;
    const finish = (state: unknown) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      pendingState.current = state;
      setSrc(target);
    };
    const onMessage = (event: MessageEvent<FrameMessage>) => {
      if (event.source === frame && event.data?.type === 'ryugi:state') finish(event.data.state ?? null);
    };
    window.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish(null), SNAPSHOT_TIMEOUT_MS);
    frame.postMessage({ type: 'ryugi:snapshot' }, '*');
    return () => {
      done = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    };
  }, [target, src]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<FrameMessage>) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.type !== 'ryugi:error') return;
      if (errorsThisLoad.current >= MAX_ERRORS_PER_LOAD) return;
      errorsThisLoad.current += 1;
      send({ type: 'runtime-error', artifact: `html/${id}`, message: String(event.data.message).slice(0, 500) });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [id, send]);

  const onFrameLoad = () => {
    errorsThisLoad.current = 0;
    const version = Number(new URL(src ?? '', location.href).searchParams.get('v'));
    send({ type: 'loaded', artifact: `html/${id}`, version });
    const state = pendingState.current;
    pendingState.current = null;
    if (state) frameRef.current?.contentWindow?.postMessage({ type: 'ryugi:restore', state }, '*');
  };

  return (
    <div {...stylex.props(styles.root)}>
      {ready && src ? (
        <iframe
          ref={frameRef}
          title={data.title}
          src={src}
          sandbox={HTML_SANDBOX}
          allow="clipboard-write"
          onLoad={onFrameLoad}
          {...stylex.props(styles.frame)}
        />
      ) : (
        <div {...stylex.props(styles.message)}>
          {data ? (data.warnings[0] ?? 'Waiting for the agent to write index.html…') : 'Connecting…'}
        </div>
      )}
      <WarningsBadge warnings={data?.warnings ?? []} />
    </div>
  );
}
