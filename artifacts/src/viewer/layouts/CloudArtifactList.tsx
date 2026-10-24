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
import { i18n, useTranslation } from '../i18n';

const deleteButtonStyle = { backgroundColor: 'var(--lobe-color-error-active)', color: '#fff' };
type Loaded = { state: 'loading' } | { state: 'signed-out' } | { state: 'error' } | { state: 'ready'; login: string; artifacts: CloudListItem[] };
type Notice = { message: string; error?: boolean; auth?: boolean; retry?: boolean };

const filterFromAddress = (): CloudFilter => {
  const visibility = new URLSearchParams(location.search).get('visibility');
  return visibility === 'public' || visibility === 'private' ? { visibility } : {};
};

export function CloudArtifactList() {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<CloudFilter>(filterFromAddress);
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
      message: `${i18n.t('cloudLibrary.deletedSome', { removed: removed.size, failed: failed.size })}${auth ? i18n.t('common.sessionExpired') : i18n.t('cloudLibrary.checkNetwork')}`,
      error: true, auth, retry: !auth,
    } : { message: i18n.t('cloudLibrary.deletedAll', { count: removed.size }) });
    deleting.current = false;
    setBusy(false);
  };

  return (
    <div className="artifact-library cloud-library">
      <header className="library-topbar">
        <div className="library-breadcrumb"><img className="library-logo" src={logo} alt="" /><strong>ryugi</strong><span>/</span><b>Cloud</b></div>
        {loaded.state === 'ready' && <div className="library-topbar-end"><CloudPlanUsage key={all.length} /><span className="library-status">{loaded.login}</span></div>}
      </header>
      {loaded.state === 'loading' && <p className="library-empty" role="status">{t('common.loading')}</p>}
      {loaded.state === 'error' && <div className="library-empty" role="alert"><p>{t('cloudLibrary.loadFailed')}</p><Button size="small" onClick={() => setRevision((value) => value + 1)}>{t('cloudLibrary.reload')}</Button></div>}
      {loaded.state === 'signed-out' && (
        <div className="library-empty">
          <RyugiMark size={28} /><h2>Ryugi Cloud</h2>
          <p>{t('cloudLibrary.signedOutBody')}</p>
          <a href="/auth/login?return=/">{t('common.signInGithub')}</a>
        </div>
      )}
      {loaded.state === 'ready' && all.length === 0 && <div className="library-empty">{notice && !notice.error && <p role="status">{notice.message}</p>}<RyugiMark size={28} /><h2>{t('cloudLibrary.emptyTitle')}</h2><p>{t('cloudLibrary.emptyBody')}</p></div>}
      {all.length > 0 && <>
        <main className="cloud-panel">
          <CloudLibrarySidebar items={all} filter={filter} onFilter={changeFilter} />
          <CloudLibraryList items={shown} filter={filter} onFilter={changeFilter} inspected={current?.id ?? null}
            onInspect={(id) => { setInspected(id); setNotice(null); reveal.current = true; }}
            selecting={selecting} selected={selected} busy={busy} onSelect={select}
            onStartSelecting={() => { setSelecting(true); setNotice(null); }} onClearFilter={() => changeFilter({})} />
          <section ref={inspectorRef} className="cloud-inspector" aria-label={t('cloudLibrary.details')}>
            {selecting
              ? <CloudSelectionSummary items={picked} />
              : current && <CloudLibraryInspector key={current.id} artifact={current} busy={busy}
                onVisibility={(visibility) => { setInspected(current.id); changeVisibility(current.id, visibility); }}
                onDelete={() => { setNotice(null); setPending([current]); }} />}
          </section>
        </main>
        <footer className="cloud-footer">
          {notice?.error && <div className="cloud-notice" role="alert">{notice.message} {notice.auth && <a href="/auth/login?return=/">{t('common.signInAgain')}</a>}</div>}
          <div className="cloud-footer-bar">
            {selecting ? <>
              <span className="cloud-strong" role="status">{t('cloudLibrary.selected', { count: picked.length })}</span>
              <span className="cloud-grow" />
              <Button size="small" disabled={busy} onClick={cancelSelection}>{t('common.cancel')}</Button>
              <Button size="small" danger type="primary" style={deleteButtonStyle} loading={busy} disabled={picked.length === 0 || busy || notice?.auth} onClick={() => {
                if (notice?.retry) void remove(picked);
                else setPending(picked);
              }}>{notice?.retry ? t('cloudLibrary.retryDelete') : t('cloudLibrary.deleteCount', { count: picked.length })}</Button>
            </> : <>
              <i className={notice ? 'cloud-dot is-on' : 'cloud-dot'} />
              <span className="cloud-grow cloud-ellipsis" role="status">{notice && !notice.error ? notice.message : t('cloudLibrary.summary', { artifacts: t('cloudLibrary.artifacts', { count: all.length }), projects: t('cloudLibrary.projects', { count: projectCounts(all).length }) })}</span>
              <span className="cloud-mono">{location.host}</span>
            </>}
          </div>
        </footer>
      </>}
      <Modal open={pending !== null} title={t('cloudLibrary.confirmTitle', { count: pending?.length ?? 0 })} width={492} centered
        okText={busy ? t('cloudLibrary.deleting') : t('cloudLibrary.deleteCount', { count: pending?.length ?? 0 })} cancelText={t('common.cancel')} confirmLoading={busy}
        okButtonProps={{ danger: true, style: deleteButtonStyle }} cancelButtonProps={{ disabled: busy }} closable={!busy} keyboard={!busy} maskClosable={!busy}
        onCancel={() => !busy && setPending(null)} onOk={() => pending && void remove(pending)}>
        <p className="cloud-delete-description">{t('cloudLibrary.confirmBody')}</p>
        <ul className="cloud-delete-items">{pending?.map((artifact) => <li key={artifact.id}><span>{artifact.title ?? artifact.id}</span><small>{artifact.project ?? t('common.other')}</small></li>)}</ul>
        <p className="cloud-delete-hint"><strong>{t('cloudLibrary.keepLocal')}</strong><br />{t('cloudLibrary.keepLocalBody')}</p>
      </Modal>
    </div>
  );
}
