import { createContext, useContext, useEffect, useState } from 'react';

import { HTML_SANDBOX, useSandboxFrame } from '../hooks/useSandboxFrame';
import type { Channel } from './channel';
import { clampFrameHeight, dynamicFrameSrc } from './dynamicFrame';

export interface DynamicHost {
  artifact: string;
  channel: Channel;
  contentBase: string;
  send: (message: unknown) => void;
}

export const DynamicHostContext = createContext<DynamicHost | null>(null);

interface Props {
  componentProps: Record<string, unknown>;
  initialHeight: number;
  url: string;
}

export function DynamicBlock({ url, componentProps, initialHeight }: Props) {
  const host = useContext(DynamicHostContext);
  const [version, setVersion] = useState(0);
  const [height, setHeight] = useState(() => clampFrameHeight(initialHeight) ?? 320);

  useEffect(
    () =>
      host?.channel.subscribe((event) => {
        if (
          event.type === 'change' &&
          event.artifact === host.artifact &&
          event.files.includes(url)
        )
          setVersion((v) => v + 1);
      }),
    [host, url],
  );

  const target = host?.contentBase
    ? dynamicFrameSrc(host.contentBase, url, version, componentProps)
    : null;
  const { frameRef, src, onLoad } = useSandboxFrame(target, {
    onError: (message) =>
      host?.send({ type: 'runtime-error', artifact: host.artifact, file: url, message }),
    onLoaded: () => host?.send({ type: 'loaded', artifact: host.artifact, file: url }),
    onMessage: (data) => {
      if (data.type !== 'ryugi:height') return;
      const next = clampFrameHeight(Number(data.height));
      if (next !== null) setHeight(next);
    },
  });

  return (
    <div className="ryugi-dynamic" contentEditable={false} style={{ height }}>
      {src ? (
        <iframe
          allow="clipboard-write"
          ref={frameRef}
          sandbox={HTML_SANDBOX}
          src={src}
          style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
          title={url}
          onLoad={onLoad}
        />
      ) : null}
    </div>
  );
}
