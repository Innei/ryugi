import './artifact-list.css';
import { Button, Checkbox, DropdownMenu, Modal, Popover } from '@lobehub/ui';
import { ArrowUpRight, Code2, Copy, FileText, Globe, Lock, MoreHorizontal, PanelsTopLeft, Share2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import logo from '../../../../assets/ryugi-small.svg';
import type { Visibility } from '../../shared/cloud';
import { ArtifactThumbnail } from '../components/ArtifactThumbnail';
import { CloudSharePanel } from '../components/CloudBanner';
import { relativeUpdatedAt } from '../lib/artifact-list';
import { groupByProject, type CloudListItem } from '../lib/cloud-list';
import { CloudRequestError, deleteCloudArtifact } from '../lib/cloud-shell';

const labels = { artboard: 'Artboard', document: 'Document', html: 'HTML' };
const icons = { artboard: PanelsTopLeft, document: FileText, html: Code2 };
const deleteButtonStyle = { backgroundColor: 'var(--lobe-color-error-active)', color: '#fff' };
type Loaded = { state: 'loading' } | { state: 'signed-out' } | { state: 'error' } | { state: 'ready'; login: string; artifacts: CloudListItem[] };
type Notice = { message: string; error?: boolean; auth?: boolean; retry?: boolean };

function CardActions({ artifact, onVisibility, onDelete, onNotice }: {
  artifact: CloudListItem;
  onVisibility: (visibility: Visibility) => void;
  onDelete: () => void;
  onNotice: (notice: Notice) => void;
}) {
  const [sharing, setSharing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.url);
      onNotice({ message: artifact.visibility === 'private' ? '已复制私有链接，仍然只有你能打开。' : '链接已复制。' });
    } catch {
      onNotice({ message: '复制失败，请打开分享设置手动复制链接。', error: true });
    }
  };
  return (
    <div className="cloud-card-actions">
      <DropdownMenu placement="bottomRight" items={[
        { key: 'copy', label: '复制链接', icon: Copy, onClick: () => void copy() },
        { key: 'share', label: '分享设置', icon: Share2, onClick: () => setSharing(true) },
        { type: 'divider' },
        { key: 'delete', label: '删除…', icon: Trash2, danger: true, onClick: onDelete },
      ]}>
        <button ref={trigger} type="button" aria-label={`管理 ${artifact.title ?? artifact.id}`} className="cloud-menu-trigger"><MoreHorizontal size={16} /></button>
      </DropdownMenu>
      {sharing && <Popover standalone open trigger={[]} placement="bottomRight" nativeButton={false}
        onOpenChange={(open) => !open && setSharing(false)} positionerProps={{ anchor: trigger }} triggerProps={{ tabIndex: -1 }}
        popupProps={{ finalFocus: trigger, 'aria-label': `分享 ${artifact.title ?? artifact.id}` }}
        content={<CloudSharePanel id={artifact.id} visibility={artifact.visibility} onChange={onVisibility} />}>
        <span aria-hidden="true" tabIndex={-1} />
      </Popover>}
    </div>
  );
}

export function CloudArtifactList() {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [revision, setRevision] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<CloudListItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const deleting = useRef(false);
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

  const groups = loaded.state === 'ready' ? groupByProject(loaded.artifacts) : [];
  const visible = groups.flatMap((group) => group.artifacts);
  const now = Date.now();

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
    setPending(null);
    setNotice(failed.size ? {
      message: `已删除 ${removed.size} 项，${failed.size} 项未删除。${auth ? '登录已过期，请重新登录。' : '请检查网络后重试。'}`,
      error: true, auth, retry: !auth,
    } : { message: `已删除 ${removed.size} 项，原分享链接已失效。` });
    deleting.current = false;
    setBusy(false);
  };

  return (
    <div className="artifact-library">
      <header className="library-topbar">
        <div className="library-breadcrumb"><img className="library-logo" src={logo} alt="" /><strong>ryugi</strong><span>/</span><b>Cloud</b></div>
        {loaded.state === 'ready' && <span className="library-status">{loaded.login}</span>}
      </header>
      <main className={`library-main${selecting ? ' cloud-selecting' : ''}`}>
        {loaded.state === 'loading' && <p className="library-empty" role="status">正在加载…</p>}
        {loaded.state === 'error' && <div className="library-empty" role="alert"><p>暂时无法加载你的 Artifact。</p><Button size="small" onClick={() => setRevision((value) => value + 1)}>重新加载</Button></div>}
        {loaded.state === 'signed-out' && (
          <div className="library-empty">
            <PanelsTopLeft size={28} /><h2>Ryugi Cloud</h2>
            <p>这里存放从 Ryugi 分享出来的 artifact。登录后可以看到你自己发布的全部 artifact。</p>
            <a href="/auth/login?return=/">用 GitHub 登录</a>
          </div>
        )}
        {loaded.state === 'ready' && groups.length > 0 && <div className="cloud-library-heading">
          <div><h1>我的 Artifact</h1><p>{visible.length} 个 Artifact · {groups.length} 个项目</p></div>
          <Button size="small" disabled={busy} onClick={() => selecting ? cancelSelection() : setSelecting(true)}>{selecting ? '退出选择' : '选择'}</Button>
        </div>}
        {notice && <div className={`cloud-library-notice${notice.error ? ' cloud-library-notice-error' : ''}`} role={notice.error ? 'alert' : 'status'}>
          {notice.message} {notice.auth && <a href="/auth/login?return=/">重新登录</a>}
        </div>}
        {loaded.state === 'ready' && groups.length === 0 && <div className="library-empty"><PanelsTopLeft size={28} /><h2>还没有发布过 Artifact</h2><p>打开自动发布，或在本地分享面板里发布，它们会出现在这里。</p></div>}
        {groups.map(({ project, artifacts }) => {
          const ids = artifacts.map((artifact) => artifact.id);
          const all = ids.every((id) => selected.has(id));
          const some = ids.some((id) => selected.has(id));
          return (
            <section key={project ?? ''} aria-label={project ?? '其他'}>
              <div className="cloud-project-heading"><h2 className="library-group">{project ?? '其他'}<span>{artifacts.length}</span></h2>
                {selecting && <Checkbox aria-label={`选择该项目 ${project ?? '其他'}`} checked={all} indeterminate={!all && some} disabled={busy} onChange={(checked) => select(ids, checked)}>选择该项目</Checkbox>}
              </div>
              <ul className="library-grid">
                {artifacts.map((artifact) => {
                  const Icon = icons[artifact.type];
                  const Seen = artifact.visibility === 'public' ? Globe : Lock;
                  const title = artifact.title ?? artifact.id;
                  const version = Date.parse(artifact.updatedAt);
                  const content = <>
                    <ArtifactThumbnail title={title} src={`/a/${artifact.id}/preview?v=${version}`} version={version} />
                    <div className="library-card-info">
                      <div className="library-card-title"><span title={title}>{title}</span>{!selecting && <ArrowUpRight size={13} aria-hidden="true" />}</div>
                      <div className="library-card-meta"><span><Icon size={12} aria-hidden="true" />{labels[artifact.type]}</span><span><Seen size={12} aria-hidden="true" />{artifact.visibility === 'public' ? '公开' : '私有'}</span><time dateTime={artifact.updatedAt} title={new Date(artifact.updatedAt).toLocaleString()}>{relativeUpdatedAt(version, now)}</time></div>
                    </div>
                  </>;
                  return (
                    <li key={artifact.id} className={`cloud-library-item${selected.has(artifact.id) ? ' cloud-library-item-selected' : ''}`}>
                      {selecting ? <button type="button" className="library-card cloud-select-card" disabled={busy} aria-label={`切换选择 ${title}`} aria-pressed={selected.has(artifact.id)} onClick={() => select([artifact.id], !selected.has(artifact.id))}>{content}</button> : <a className="library-card" href={`/a/${artifact.id}`}>{content}</a>}
                      {selecting ? <div className="cloud-card-checkbox"><Checkbox aria-label={`选择 ${title}`} checked={selected.has(artifact.id)} disabled={busy} onChange={(checked) => select([artifact.id], checked)} /></div> : <CardActions artifact={artifact} onVisibility={(visibility) => changeVisibility(artifact.id, visibility)} onDelete={() => { setNotice(null); setPending([artifact]); }} onNotice={setNotice} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {selecting && <div className="cloud-batch-bar" role="region" aria-label="批量管理">
          <span role="status">已选 {selected.size} 项</span><Button size="small" disabled={busy} onClick={cancelSelection}>取消</Button>
          <Button size="small" danger type="primary" style={deleteButtonStyle} loading={busy} disabled={selected.size === 0 || busy || notice?.auth} onClick={() => {
            const targets = visible.filter((artifact) => selected.has(artifact.id));
            if (notice?.retry) void remove(targets);
            else setPending(targets);
          }}>{notice?.retry ? '重试删除' : `删除 ${selected.size} 项`}</Button>
        </div>}
      </main>
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
