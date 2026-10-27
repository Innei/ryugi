import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { type ReactNode, useEffect } from 'react';

import { WarningsBadge } from '../components/WarningsBadge';
import { useHtmlData } from '../hooks/useHtmlData';
import { HTML_SANDBOX, useSandboxFrame } from '../hooks/useSandboxFrame';
import { useTypeFavicon } from '../hooks/useTypeFavicon';
import type { ArtifactFeed } from '../lib/feed';

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

export function HtmlView({
  id,
  feed,
  actions,
}: {
  id: string;
  feed: ArtifactFeed;
  actions?: ReactNode;
}) {
  const { data, send } = useHtmlData(id, feed);

  useEffect(() => {
    document.title = data?.title || id;
  }, [data?.title, id]);
  useTypeFavicon('html');

  const ready = data?.found && !data.warnings.includes('index.html not found');
  const target = ready ? `${data.contentBase}index.html?v=${data.version}` : null;
  const { frameRef, src, onLoad } = useSandboxFrame(target, {
    onError: (message) => send({ type: 'runtime-error', artifact: `html/${id}`, message }),
    onLoaded: (loaded) => {
      const version = Number(new URL(loaded, location.href).searchParams.get('v'));
      send({ type: 'loaded', artifact: `html/${id}`, version });
    },
  });

  return (
    <div {...stylex.props(styles.root)}>
      {ready && src ? (
        <iframe
          allow="clipboard-write"
          ref={frameRef}
          sandbox={HTML_SANDBOX}
          src={src}
          title={data.title}
          onLoad={onLoad}
          {...stylex.props(styles.frame)}
        />
      ) : (
        <div {...stylex.props(styles.message)}>
          {data
            ? (data.warnings[0] ?? 'Waiting for the agent to write index.html…')
            : 'Connecting…'}
        </div>
      )}
      {actions}
      <WarningsBadge warnings={data?.warnings ?? []} />
    </div>
  );
}
