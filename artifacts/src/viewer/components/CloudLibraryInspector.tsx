import { Button } from '@lobehub/ui';
import { ArrowUpRight, Trash2 } from 'lucide-react';
import type { Visibility } from '../../shared/cloud';
import { relativeUpdatedAt } from '../lib/artifact-list';
import type { CloudListItem } from '../lib/cloud-list';
import { ArtifactThumbnail } from './ArtifactThumbnail';
import { useCloudSharePanel } from './CloudBanner';
import { typeLabels } from './CloudLibraryList';

export function CloudLibraryInspector({ artifact, busy, onVisibility, onDelete }: {
  artifact: CloudListItem;
  busy: boolean;
  onVisibility: (visibility: Visibility) => void;
  onDelete: () => void;
}) {
  const share = useCloudSharePanel({ id: artifact.id, title: artifact.title, visibility: artifact.visibility, onChange: onVisibility, inline: true });
  const title = artifact.title ?? artifact.id;
  const version = Date.parse(artifact.updatedAt);
  const project = artifact.project ?? '其他';
  return (
    <>
      <div className="cloud-inspector-head">
        <div className="cloud-row-text">
          <h2 title={title} tabIndex={-1}>{title}</h2>
          <span className="cloud-row-meta">{typeLabels[artifact.type]} · {project} · v{artifact.version}</span>
        </div>
        <a className="cloud-button" href={`/a/${artifact.id}`}>打开<ArrowUpRight size={13} aria-hidden="true" /></a>
      </div>
      <div className="cloud-preview">
        <ArtifactThumbnail title={title} src={`/a/${artifact.id}/preview?v=${version}`} version={version} />
      </div>
      {share}
      <dl className="cloud-details">
        <dt>更新</dt><dd><time dateTime={artifact.updatedAt} title={new Date(artifact.updatedAt).toLocaleString()}>{relativeUpdatedAt(version, Date.now())}</time></dd>
        <dt>版本</dt><dd className="cloud-mono">v{artifact.version}</dd>
        <dt>项目</dt><dd>{project}</dd>
      </dl>
      <div className="cloud-inspector-foot">
        <span>删除后原分享链接会失效。</span>
        <Button size="small" danger icon={Trash2} disabled={busy} onClick={onDelete}>删除…</Button>
      </div>
    </>
  );
}

export function CloudSelectionSummary({ items }: { items: CloudListItem[] }) {
  return (
    <>
      <div>
        <h2>已选 {items.length} 项</h2>
        <p className="cloud-muted">勾选左侧列表，或用表头的复选框全选当前筛选。</p>
      </div>
      {items.length > 0
        ? <ul className="cloud-picked">{items.map((item) => <li key={item.id}><span>{item.title ?? item.id}</span><small>{item.project ?? '其他'}</small></li>)}</ul>
        : <p className="cloud-muted cloud-center">还没有选中任何一项。</p>}
    </>
  );
}
