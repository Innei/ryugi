import * as stylex from '@stylexjs/stylex';
import { useEffect, useEffectEvent, useRef } from 'react';

import { createEmbedHost } from '../lib/embed-bridge';

const styles = stylex.create({
  frame: {
    display: 'block',
    width: '100%',
    height: '100%',
    border: 0,
  },
});

export function EmbeddedCanvas({
  src,
  title,
  onReady,
  onLost,
}: {
  src: string;
  title: string;
  onReady?: () => void;
  onLost: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const ready = useEffectEvent(() => onReady?.());
  const lost = useEffectEvent(() => onLost());
  useEffect(() => {
    const bridge = createEmbedHost({
      frame: () => frameRef.current?.contentWindow,
      childOrigin: new URL(src).origin,
      onReady: ready,
      onLost: lost,
    });
    return bridge.close;
  }, [src]);
  return (
    <iframe
      allow="clipboard-write; local-network-access; loopback-network"
      ref={frameRef}
      src={src}
      title={title}
      {...stylex.props(styles.frame)}
    />
  );
}
