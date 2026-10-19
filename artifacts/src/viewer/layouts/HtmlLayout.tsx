import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect } from 'react';
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

export function HtmlLayout({ id }: { id: string }) {
  const { data } = useHtmlData(id);

  useEffect(() => {
    document.title = data?.title || id;
  }, [data?.title, id]);

  const ready = data?.found && !data.warnings.includes('index.html not found');

  return (
    <div {...stylex.props(styles.root)}>
      {ready ? (
        <iframe
          key={data.version}
          title={data.title}
          src={`${data.contentBase}index.html?v=${data.version}`}
          sandbox={HTML_SANDBOX}
          allow="clipboard-write"
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
