import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect } from 'react';
import { WarningsBadge } from '../components/WarningsBadge';
import { useHtmlData } from '../hooks/useHtmlData';
import { HTML_SANDBOX, useSandboxFrame } from '../hooks/useSandboxFrame';

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

export function HtmlLayout({ id }: { id: string }) {
  const { data, send } = useHtmlData(id);

  useEffect(() => {
    document.title = data?.title || id;
  }, [data?.title, id]);

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
          ref={frameRef}
          title={data.title}
          src={src}
          sandbox={HTML_SANDBOX}
          allow="clipboard-write"
          onLoad={onLoad}
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
