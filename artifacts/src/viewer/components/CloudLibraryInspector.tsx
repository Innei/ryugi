import { Button } from '@lobehub/ui';
import { ArrowUpRight, Trash2 } from 'lucide-react';
import type { Visibility } from '../../shared/cloud';
import { relativeUpdatedAt } from '../lib/artifact-list';
import type { CloudListItem } from '../lib/cloud-list';
import { ArtifactThumbnail } from './ArtifactThumbnail';
import { useCloudSharePanel } from './CloudBanner';
import { typeLabels } from './CloudLibraryList';
import { i18n, useTranslation } from '../i18n';

export function CloudLibraryInspector({ artifact, busy, onVisibility, onDelete }: {
  artifact: CloudListItem;
  busy: boolean;
  onVisibility: (visibility: Visibility) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const share = useCloudSharePanel({ id: artifact.id, title: artifact.title, visibility: artifact.visibility, published: artifact.version !== null, onChange: onVisibility, inline: true });
  const title = artifact.title ?? artifact.id;
  const version = Date.parse(artifact.updatedAt);
  const project = artifact.project ?? t('common.other');
  return (
    <>
      <div className="cloud-inspector-head">
        <div className="cloud-row-text">
          <h2 title={title} tabIndex={-1}>{title}</h2>
          <span className="cloud-row-meta">{typeLabels[artifact.type]} · {project} · v{artifact.version}</span>
        </div>
        <a className="cloud-button" href={`/a/${artifact.id}`}>{t('common.open')}<ArrowUpRight size={13} aria-hidden="true" /></a>
      </div>
      <div className="cloud-preview">
        <ArtifactThumbnail title={title} src={`/a/${artifact.id}/preview?v=${version}`} version={version} />
      </div>
      {share}
      <dl className="cloud-details">
        <dt>{t('cloudLibrary.updated')}</dt><dd><time dateTime={artifact.updatedAt} title={new Date(artifact.updatedAt).toLocaleString(i18n.language)}>{relativeUpdatedAt(version, Date.now())}</time></dd>
        <dt>{t('cloudLibrary.version')}</dt><dd className="cloud-mono">v{artifact.version}</dd>
        <dt>{t('common.project')}</dt><dd>{project}</dd>
      </dl>
      <div className="cloud-inspector-foot">
        <span>{t('cloudLibrary.deleteBreaks')}</span>
        <Button size="small" danger icon={Trash2} disabled={busy} onClick={onDelete}>{t('cloudLibrary.deleteEllipsis')}</Button>
      </div>
    </>
  );
}

export function CloudSelectionSummary({ items }: { items: CloudListItem[] }) {
  const { t } = useTranslation();
  return (
    <>
      <div>
        <h2>{t('cloudLibrary.selected', { count: items.length })}</h2>
        <p className="cloud-muted">{t('cloudLibrary.selectHint')}</p>
      </div>
      {items.length > 0
        ? <ul className="cloud-picked">{items.map((item) => <li key={item.id}><span>{item.title ?? item.id}</span><small>{item.project ?? t('common.other')}</small></li>)}</ul>
        : <p className="cloud-muted cloud-center">{t('cloudLibrary.noneSelected')}</p>}
    </>
  );
}
