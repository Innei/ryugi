import { useEffect, useRef, useState } from 'react';

export const HTML_SANDBOX = 'allow-scripts allow-modals allow-forms allow-popups allow-downloads';

const SNAPSHOT_TIMEOUT_MS = 300;
const MAX_ERRORS_PER_LOAD = 10;

export interface FrameMessage {
  type?: string;
  state?: unknown;
  message?: unknown;
  height?: unknown;
}

interface Handlers {
  onError: (message: string) => void;
  onLoaded: (src: string) => void;
  onMessage?: (data: FrameMessage) => void;
}

export function useSandboxFrame(target: string | null, handlers: Handlers) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const pendingState = useRef<unknown>(null);
  const errorsThisLoad = useRef(0);
  const latest = useRef(handlers);
  latest.current = handlers;

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
      if (event.source === frame && event.data?.type === 'ryugi:state')
        finish(event.data.state ?? null);
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
      if (event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === 'ryugi:error') {
        if (errorsThisLoad.current >= MAX_ERRORS_PER_LOAD) return;
        errorsThisLoad.current += 1;
        latest.current.onError(String(event.data.message).slice(0, 500));
      } else if (event.data) latest.current.onMessage?.(event.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const onLoad = () => {
    errorsThisLoad.current = 0;
    if (src) latest.current.onLoaded(src);
    const state = pendingState.current;
    pendingState.current = null;
    if (state) frameRef.current?.contentWindow?.postMessage({ type: 'ryugi:restore', state }, '*');
  };

  return { frameRef, src, onLoad };
}
