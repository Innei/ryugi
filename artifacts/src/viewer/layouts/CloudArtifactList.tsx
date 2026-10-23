import './artifact-list.css';
import './cloud-library.css';
import { Button, Modal } from '@lobehub/ui';
import { useEffect, useRef, useState } from 'react';
import logo from '../../../../assets/ryugi-small.svg';
import type { Visibility } from '../../shared/cloud';
import { CloudLibraryInspector, CloudSelectionSummary } from '../components/CloudLibraryInspector';
import { CloudLibraryList } from '../components/CloudLibraryList';
import { CloudLibrarySidebar } from '../components/CloudLibrarySidebar';
import { RyugiMark } from '../components/RyugiMark';
import { filterCloudItems, projectCounts, publishedNewestFirst, type CloudFilter, type CloudListItem } from '../lib/cloud-list';
import { CloudRequestError, deleteCloudArtifact } from '../lib/cloud-shell';
import { CloudPlanUsage } from '../components/CloudPlanUsage';

const deleteButtonStyle = { backgroundColor: 'var(--lobe-color-error-active)', color: '#fff' };
type Loaded = { state: 'loading' } | { state: 'signed-out' } | { state: 'error' } | { state: 'ready'; login: string; artifacts: CloudListItem[] };
type Notice = { message: string; error?: boolean; auth?: boolean; retry?: boolean };

export function CloudArtifactList() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<CloudFilter>({});
  const [inspected, setInspected] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<CloudListItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const deleting = useRef(false);
  const inspectorRef = useRef<HTMLElement>(null);
  const afterDelete = useRef(false);
  const reveal = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    document.title = 'Ryugi Cloud';
    setLoaded({ state: 'loading' });
    setSelected(new Set());
    setSelecting(false);
    void (async () => {
      try {
        const res = await fetch('/api/account/artifacts', { cache: 'no-store', credentials: 'same-origin' });
        if (cancelled) return;
        if (res.status === 401) return setLoaded({ state: 'signed-out' });
        if (!res.ok) return setLoaded({ state: 'error' });
        const json = (await res.json()) as { login: string; artifacts: CloudListItem[] };
        if (!cancelled) setLoaded({ state: 'ready', login: json.login, artifacts: json.artifacts });
      } catch {
        if (!cancelled) setLoaded({ state: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [revision]);

  const all = loaded.state === 'ready' ? publishedNewestFirst(loaded.artifacts) : [];
  const shown = filterCloudItems(all, filter);
  const current = all.find((artifact) => artifact.id === inspected) ?? shown[0] ?? null;

  useEffect(() => {
    if (reveal.current) {
      reveal.current = false;
      if (window.matchMedia('(max-width: 860px)').matches) inspectorRef.current?.scrollIntoView({ block: 'start' });
    }
    if (afterDelete.current && pending === null) {
      afterDelete.current = false;
      const timer = setTimeout(() => inspectorRef.current?.querySelector<HTMLElement>('h2')?.focus());
      return () => clearTimeout(timer);
    }
  });
  const picked = all.filter((artifact) => selected.has(artifact.id));

  const changeFilter = (next: CloudFilter) => {
    setFilter(next);
    setInspected(null);
  };
  const select = (ids: string[], checked: boolean) => {
    setNotice(null);
    setSelected((previous) => {
      const next = new Set(previous);
      for (const id of ids) checked ? next.add(id) : next.delete(id);
      return next;
    });
  };
  const cancelSelection = () => {
    setSelecting(false);
    setSelected(new Set());
    setNotice(null);
  };
  const changeVisibility = (id: string, visibility: Visibility) => {
    setLoaded((previous) => previous.state === 'ready' ? { ...previous, artifacts: previous.artifacts.map((artifact) => artifact.id === id ? { ...artifact, visibility } : artifact) } : previous);
  };
  const remove = async (targets: CloudListItem[]) => {
    if (deleting.current || targets.length === 0) return;
    deleting.current = true;
    setBusy(true);
    setNotice(null);
    const removed = new Set<string>();
    const failed = new Set<string>();
    let auth = false;
    for (const artifact of targets) {
      if (auth) { failed.add(artifact.id); continue; }
      try {
        await deleteCloudArtifact(artifact.id);
        removed.add(artifact.id);
        setLoaded((previous) => previous.state === 'ready' ? { ...previous, artifacts: previous.artifacts.filter((item) => item.id !== artifact.id) } : previous);
      } catch (error) {
        failed.add(artifact.id);
        auth = error instanceof CloudRequestError && error.status === 401;
      }
    }
    setSelected(failed);
    setSelecting(failed.size > 0);
    afterDelete.current = failed.size === 0;
    setPending(null);
    setNotice(failed.size ? {
      message: `已删除 ${removed.size} 项，${failed.size} 项未删除。${auth ? '登录已过期，请重新登录。' : '请检查网络后重试。'}`,
      error: true, auth, retry: !auth,
    } : { message: `已删除 ${removed.size} 项，原分享链接已失效。` });
    deleting.current = false;
    setBusy(false);
  };

  return (
    <div className="artifact-library cloud-library">
      <header className="library-topbar">
        <div className="library-breadcrumb"><img className="library-logo" src={logo} alt="" /><strong>ryugi</strong><span>/</span><b>Cloud</b></div>
        {loaded.state === 'ready' && <div className="library-topbar-end"><CloudPlanUsage key={all.length} /><span className="library-status">{loaded.login}</span></div>}
      </header>
      {loaded.state === 'loading' && <p className="library-empty" role="status">正在加载…</p>}
      {loaded.state === 'error' && <div className="library-empty" role="alert"><p>暂时无法加载你的 Artifact。</p><Button size="small" onClick={() => setRevision((value) => value + 1)}>重新加载</Button></div>}
      {loaded.state === 'signed-out' && (
        <div className="library-empty">
          <RyugiMark size={28} /><h2>Ryugi Cloud</h2>
          <p>这里存放从 Ryugi 分享出来的 artifact。登录后可以看到你自己发布的全部 artifact。</p>
          <a href="/auth/login?return=/">用 GitHub 登录</a>
        </div>
      )}
      {loaded.state === 'ready' && all.length === 0 && <div className="library-empty">{notice && !notice.error && <p role="status">{notice.message}</p>}<RyugiMark size={28} /><h2>还没有发布过 Artifact</h2><p>打开自动发布，或在本地分享面板里发布，它们会出现在这里。</p></div>}
      {all.length > 0 && <>
        <main className="cloud-panel">
          <CloudLibrarySidebar items={all} filter={filter} onFilter={changeFilter} />
          <CloudLibraryList items={shown} filter={filter} onFilter={changeFilter} inspected={current?.id ?? null}
            onInspect={(id) => { setInspected(id); setNotice(null); reveal.current = true; }}
            selecting={selecting} selected={selected} busy={busy} onSelect={select}
            onStartSelecting={() => { setSelecting(true); setNotice(null); }} onClearFilter={() => changeFilter({})} />
          <section ref={inspectorRef} className="cloud-inspector" aria-label="详情">
            {selecting
              ? <CloudSelectionSummary items={picked} />
              : current && <CloudLibraryInspector key={current.id} artifact={current} busy={busy}
                onVisibility={(visibility) => { setInspected(current.id); changeVisibility(current.id, visibility); }}
                onDelete={() => { setNotice(null); setPending([current]); }} />}
          </section>
        </main>
        <footer className="cloud-footer">
          {notice?.error && <div className="cloud-notice" role="alert">{notice.message} {notice.auth && <a href="/auth/login?return=/">重新登录</a>}</div>}
          <div className="cloud-footer-bar">
            {selecting ? <>
              <span className="cloud-strong" role="status">已选 {picked.length} 项</span>
              <span className="cloud-grow" />
              <Button size="small" disabled={busy} onClick={cancelSelection}>取消</Button>
              <Button size="small" danger type="primary" style={deleteButtonStyle} loading={busy} disabled={picked.length === 0 || busy || notice?.auth} onClick={() => {
                if (notice?.retry) void remove(picked);
                else setPending(picked);
              }}>{notice?.retry ? '重试删除' : `删除 ${picked.length} 项`}</Button>
            </> : <>
              <i className={notice ? 'cloud-dot is-on' : 'cloud-dot'} />
              <span className="cloud-grow cloud-ellipsis" role="status">{notice && !notice.error ? notice.message : `${all.length} 个 Artifact · ${projectCounts(all).length} 个项目`}</span>
              <span className="cloud-mono">{location.host}</span>
            </>}
          </div>
        </footer>
      </>}
      <Modal open={pending !== null} title={`删除这 ${pending?.length ?? 0} 个 Artifact？`} width={492} centered
        okText={busy ? '正在删除…' : `删除 ${pending?.length ?? 0} 项`} cancelText="取消" confirmLoading={busy}
        okButtonProps={{ danger: true, style: deleteButtonStyle }} cancelButtonProps={{ disabled: busy }} closable={!busy} keyboard={!busy} maskClosable={!busy}
        onCancel={() => !busy && setPending(null)} onOk={() => pending && void remove(pending)}>
        <p className="cloud-delete-description">云端内容和历史版本将永久删除，原分享链接会失效。此操作无法撤销。</p>
        <ul className="cloud-delete-items">{pending?.map((artifact) => <li key={artifact.id}><span>{artifact.title ?? artifact.id}</span><small>{artifact.project ?? '其他'}</small></li>)}</ul>
        <p className="cloud-delete-hint"><strong>本地源文件会保留。</strong><br />本地发现云端副本已删除后，会停止自动发布。之后手动发布会生成新链接。</p>
      </Modal>
    </div>
  );
}
