import './artifact-list.css';
import './cloud-library.css';
import './cloud-overview.css';
import { Button, Modal, toast } from '@lobehub/ui';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Visibility } from '../../shared/cloud';
import { CloudLibraryInspector, CloudSelectionSummary } from '../components/CloudLibraryInspector';
import { CloudLibraryHead, CloudLibraryList, type CloudView } from '../components/CloudLibraryList';
import { CloudLibrarySidebar } from '../components/CloudLibrarySidebar';
import { CloudSelectionBar } from '../components/CloudSelectionBar';
import { RyugiMark } from '../components/RyugiMark';
import { filterCloudItems, filterFromSearch, filterSearch, publishedNewestFirst, type CloudFilter, type CloudListItem } from '../lib/cloud-list';
import { cloudListMenus } from '../lib/cloud-list-menus';
import { CloudRequestError, deleteCloudArtifact } from '../lib/cloud-shell';
import { useCloudPlan } from './CloudDashboard';
import { i18n, useTranslation } from '../i18n';

const deleteButtonStyle = { backgroundColor: 'var(--lobe-color-error-active)', color: '#fff' };
type Loaded = { state: 'loading' } | { state: 'signed-out' } | { state: 'error' } | { state: 'ready'; login: string; profilePath: string | null; artifacts: CloudListItem[] };

const VIEW_KEY = 'ryugi-cloud-view';

const savedView = (): CloudView => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
};

export function CloudArtifactList() {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [revision, setRevision] = useState(0);
  const [filter, setFilter] = useState<CloudFilter>(() => filterFromSearch(location.search));
  const [inspected, setInspected] = useState<string | null>(null);
  const [view, setView] = useState<CloudView>(savedView);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<CloudListItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const deleting = useRef(false);
  const inspectorRef = useRef<HTMLElement>(null);
  const afterDelete = useRef(false);
  const focusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reveal = useRef(false);
  const [failure, setFailure] = useState<{ auth: boolean } | null>(null);

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
        const json = (await res.json()) as { login: string; profilePath?: string; artifacts: CloudListItem[] };
        if (!cancelled) setLoaded({ state: 'ready', login: json.login, profilePath: json.profilePath ?? null, artifacts: json.artifacts });
      } catch {
        if (!cancelled) setLoaded({ state: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [revision]);

  const all = loaded.state === 'ready' ? publishedNewestFirst(loaded.artifacts) : [];
  const shown = filterCloudItems(all, filter);
  const grid = view === 'grid';
  const current = all.find((artifact) => artifact.id === inspected) ?? (grid ? null : shown[0] ?? null);
  const floating = grid && !selecting && current !== null;
  const { summary: plan, refreshPlan } = useCloudPlan();
  const counted = useRef<number | null>(null);
  useEffect(() => {
    if (loaded.state !== 'ready') return;
    if (counted.current !== null && counted.current !== all.length) refreshPlan();
    counted.current = all.length;
  }, [loaded.state, all.length, refreshPlan]);

  useEffect(() => {
    if (reveal.current) {
      reveal.current = false;
      if (window.matchMedia('(max-width: 860px)').matches) inspectorRef.current?.scrollIntoView({ block: 'start' });
    }
    if (afterDelete.current && pending === null) {
      afterDelete.current = false;
      focusTimer.current = setTimeout(() => inspectorRef.current?.querySelector<HTMLElement>('h2')?.focus());
    }
  });
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  const picked = all.filter((artifact) => selected.has(artifact.id));

  useEffect(() => {
    if (!floating) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && pending === null) setInspected(null); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [floating, pending]);

  const changeView = (next: CloudView) => {
    setView(next);
    setInspected(null);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };
  const changeFilter = (next: CloudFilter) => {
    setFilter(next);
    setInspected(null);
    history.replaceState(history.state, '', `${location.pathname}${filterSearch(next)}${location.hash}`);
  };
  const select = (ids: string[], checked: boolean) => {
    setFailure(null);
    setSelected((previous) => {
      const next = new Set(previous);
      for (const id of ids) checked ? next.add(id) : next.delete(id);
      return next;
    });
  };
  const cancelSelection = () => {
    setSelecting(false);
    setSelected(new Set());
    setFailure(null);
  };
  const startSelecting = (ids: string[]) => {
    setSelecting(true);
    setSelected(new Set(ids));
    setFailure(null);
  };
  const patch = (id: string, change: Partial<CloudListItem>) => {
    setLoaded((previous) => previous.state === 'ready' ? { ...previous, artifacts: previous.artifacts.map((artifact) => artifact.id === id ? { ...artifact, ...change } : artifact) } : previous);
  };
  const changeVisibility = (id: string, visibility: Visibility) => {
    patch(id, { visibility });
    refreshPlan();
  };
  const { artifactMenu, projectMenu } = cloudListMenus({
    all, filter, busy, profilePath: loaded.state === 'ready' ? loaded.profilePath : null,
    setBusy, changeFilter, startSelecting, confirmDelete: setPending, patch, refreshPlan,
  });
  const remove = async (targets: CloudListItem[]) => {
    if (deleting.current || targets.length === 0) return;
    deleting.current = true;
    setBusy(true);
    setFailure(null);
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
    if (failed.size === 0) {
      toast.success(i18n.t('cloudLibrary.deletedAll', { count: removed.size }));
    } else {
      const left = targets.filter((artifact) => failed.has(artifact.id));
      setFailure({ auth });
      toast.error({
        title: i18n.t('cloudLibrary.deletedSome', { removed: removed.size, failed: failed.size }).trim(),
        description: auth ? i18n.t('common.sessionExpired') : i18n.t('cloudLibrary.checkNetwork'),
        actions: [auth
          ? { label: i18n.t('common.signInAgain'), variant: 'primary', onClick: () => location.assign('/auth/login?return=/') }
          : { label: i18n.t('cloudLibrary.retryDelete'), onClick: () => void remove(left) }],
      });
    }
    deleting.current = false;
    setBusy(false);
  };

  return (
    <>
      {loaded.state === 'loading' && <p className="library-empty" role="status">{t('common.loading')}</p>}
      {loaded.state === 'error' && <div className="library-empty" role="alert"><p>{t('cloudLibrary.loadFailed')}</p><Button size="small" onClick={() => setRevision((value) => value + 1)}>{t('cloudLibrary.reload')}</Button></div>}
      {loaded.state === 'signed-out' && (
        <div className="library-empty">
          <RyugiMark size={28} /><h2>Ryugi Cloud</h2>
          <p>{t('cloudLibrary.signedOutBody')}</p>
          <a href="/auth/login?return=/">{t('common.signInGithub')}</a>
        </div>
      )}
      {loaded.state === 'ready' && all.length === 0 && <div className="library-empty"><RyugiMark size={28} /><h2>{t('cloudLibrary.emptyTitle')}</h2><p>{t('cloudLibrary.emptyBody')}</p></div>}
      {all.length > 0 && (
        <main className="cloud-panel">
          <CloudLibrarySidebar items={all} filter={filter} onFilter={changeFilter} onProjectMenu={projectMenu} />
          <div className="cloud-workspace">
            <CloudLibraryHead count={shown.length} filter={filter} onFilter={changeFilter} view={view} onView={changeView} />
            <div className="cloud-workspace-body">
              <CloudLibraryList items={shown} view={view} inspected={current?.id ?? null}
                onInspect={(id) => { setInspected(id); reveal.current = true; }}
                selecting={selecting} selected={selected} busy={busy} onSelect={select} onMenu={artifactMenu}
                onStartSelecting={() => startSelecting([])} onClearFilter={() => changeFilter({})}
                bar={selecting && <CloudSelectionBar count={picked.length} busy={busy} retry={failure !== null && !failure.auth} blocked={failure?.auth ?? false}
                  onCancel={cancelSelection} onDelete={() => failure ? void remove(picked) : setPending(picked)} />} />
              {(!grid || floating) && <section ref={inspectorRef} className={floating ? 'cloud-inspector is-floating' : 'cloud-inspector'} aria-label={t('cloudLibrary.details')}>
                {floating && <button type="button" className="cloud-icon-button cloud-inspector-close" aria-label={t('cloudLibrary.closeDetails')} title={t('cloudLibrary.closeDetails')} onClick={() => setInspected(null)}><X size={15} aria-hidden="true" /></button>}
                {selecting && !grid
                  ? <CloudSelectionSummary items={picked} />
                  : current && <CloudLibraryInspector key={current.id} artifact={current} busy={busy} storageLimit={plan?.limits.storage?.bytes ?? null}
                    profilePath={loaded.state === 'ready' ? loaded.profilePath : null} onProfile={(onProfile) => patch(current.id, { onProfile })}
                    onVisibility={(visibility) => { setInspected(current.id); changeVisibility(current.id, visibility); }}
                    onDelete={() => setPending([current])} />}
              </section>}
            </div>
          </div>
        </main>
      )}
      <Modal open={pending !== null} title={t('cloudLibrary.confirmTitle', { count: pending?.length ?? 0 })} width={492} centered
        okText={busy ? t('cloudLibrary.deleting') : t('cloudLibrary.deleteCount', { count: pending?.length ?? 0 })} cancelText={t('common.cancel')} confirmLoading={busy}
        okButtonProps={{ danger: true, style: deleteButtonStyle }} cancelButtonProps={{ disabled: busy }} closable={!busy} keyboard={!busy} maskClosable={!busy}
        onCancel={() => !busy && setPending(null)} onOk={() => pending && void remove(pending)}>
        <p className="cloud-delete-description">{t('cloudLibrary.confirmBody')}</p>
        <ul className="cloud-delete-items">{pending?.map((artifact) => <li key={artifact.id}><span>{artifact.title ?? artifact.id}</span><small>{artifact.project ?? t('common.other')}</small></li>)}</ul>
        <p className="cloud-delete-hint"><strong>{t('cloudLibrary.keepLocal')}</strong><br />{t('cloudLibrary.keepLocalBody')}</p>
      </Modal>
    </>
  );
}
