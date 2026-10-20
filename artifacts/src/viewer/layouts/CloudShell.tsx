import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import { OwnerBanner, VisitorBanner } from '../components/CloudBanner';
import { loadShell, type ShellState } from '../lib/cloud-shell';
import { CloudNotFound } from './CloudNotFound';

const styles = stylex.create({
  shell: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', backgroundColor: cssVar.colorBgLayout },
  frame: { flex: 1, minHeight: 0, display: 'block', width: '100%', borderWidth: 0 },
  message: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 14,
  },
});

export function CloudShell({ id }: { id: string }) {
  const [state, setState] = useState<ShellState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadShell(id).then(
      (next) => !cancelled && setState(next),
      (err: unknown) => !cancelled && setState({ kind: 'failed', message: (err as Error).message }),
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (state.kind === 'ready') document.title = state.title;
    if (state.kind === 'missing') document.title = '这个链接打不开';
  }, [state]);

  if (state.kind === 'loading') return <div {...stylex.props(styles.message)}>正在加载…</div>;
  if (state.kind === 'failed') return <div {...stylex.props(styles.message)}>{state.message}</div>;
  if (state.kind === 'missing') return <CloudNotFound id={id} login={state.login} />;
  return (
    <div {...stylex.props(styles.shell)}>
      {state.owner ? (
        <OwnerBanner id={id} visibility={state.visibility} onChange={(visibility) => setState({ ...state, visibility })} />
      ) : (
        <VisitorBanner />
      )}
      <iframe title={state.title} src={`/a/${id}/view`} allow="clipboard-write" {...stylex.props(styles.frame)} />
    </div>
  );
}
