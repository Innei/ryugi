import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { CloudHeader } from '../components/CloudBanner';
import { readCloudHeader, type CloudHeaderState } from '../hooks/useCloudHeader';
import { loadShell, type ShellState } from '../lib/cloud-shell';
import { knownHosts, takeHostHint } from '../lib/knownHosts';
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

function rememberHostHint() {
  if (takeHostHint(location.hash, knownHosts()) !== null) history.replaceState(history.state, '', `${location.pathname}${location.search}`);
}

export function CloudShell({ id }: { id: string }) {
  useState(rememberHostHint);
  const [state, setState] = useState<ShellState>({ kind: 'loading' });
  const [header, setHeader] = useState<CloudHeaderState>({});
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!frame.current?.contentWindow || event.source !== frame.current.contentWindow || event.origin !== location.origin) return;
      const update = readCloudHeader(event.data, id);
      if (update) setHeader((previous) => ({ ...previous, ...update }));
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [id]);

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
    if (state.kind === 'ready') document.title = header.title || state.title;
    if (state.kind === 'missing') document.title = '这个链接打不开';
  }, [state, header.title]);

  if (state.kind === 'loading') return <div {...stylex.props(styles.message)}>正在加载…</div>;
  if (state.kind === 'failed') return <div {...stylex.props(styles.message)}>{state.message}</div>;
  if (state.kind === 'missing') return <CloudNotFound id={id} login={state.login} />;
  return (
    <div {...stylex.props(styles.shell)}>
      <CloudHeader id={id} type={state.type} title={header.title || state.title} owner={state.owner} status={header} visibility={state.visibility} onChange={(visibility) => setState({ ...state, visibility })} />
      <iframe ref={frame} title={header.title || state.title} src={`/a/${id}/view`} allow="clipboard-write; local-network-access; loopback-network" {...stylex.props(styles.frame)} />
    </div>
  );
}
