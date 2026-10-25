import { Button, Checkbox } from '@lobehub/ui';
import { ArrowUpRight, Trash2 } from 'lucide-react';
import type { Visibility } from '../../shared/cloud';
import { relativeUpdatedAt } from '../lib/artifact-list';
import { formatBytes, type CloudListItem } from '../lib/cloud-list';
import { useDailyViews } from '../hooks/useDailyViews';
import { setOnProfile } from '../lib/cloud-shell';
import { useState } from 'react';
import { ArtifactThumbnail } from './ArtifactThumbnail';
import { useCloudSharePanel } from './CloudBanner';
import { ViewsSparkline } from './ViewsSparkline';
import { typeLabels } from './CloudLibraryList';
import { i18n, useTranslation } from '../i18n';

function sizeText(artifact: CloudListItem, storageLimit: number | null) {
  if (artifact.storageBytes === undefined) return null;
  const parts = [formatBytes(artifact.storageBytes)];
  if (artifact.files !== undefined) parts.push(i18n.t('cloudLibrary.files', { count: artifact.files }));
  if (storageLimit) {
    const share = (artifact.storageBytes / storageLimit) * 100;
    const percent = Math.round(share);
    const limit = formatBytes(storageLimit);
    parts.push(share < 1 ? i18n.t('cloudLibrary.underOnePercent', { limit }) : i18n.t('cloudLibrary.shareOfLimit', { percent, limit }));
  }
  return parts.join(' · ');
}

function ProfileListing({ artifact, profilePath, onChange }: { artifact: CloudListItem; profilePath: string; onChange: (shown: boolean) => void }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = artifact.onProfile !== false;
  const toggle = async (next: boolean) => {
    setSaving(true);
    setError(null);
    onChange(next);
    try {
      await setOnProfile(artifact.id, next);
    } catch (err) {
      onChange(!next);
      setError((err as Error).message);
    }
    setSaving(false);
  };
  return (
    <div className="cloud-profile-listing">
      <Checkbox aria-label={t('cloudProfile.showOnProfile')} checked={shown} disabled={saving} onChange={(checked) => void toggle(checked)}>{t('cloudProfile.showOnProfile')}</Checkbox>
      <p>{shown ? t('cloudProfile.listedAt', { path: `${location.host}${profilePath}` }) : t('cloudProfile.linkOnly')}</p>
      {error && <p className="cloud-profile-error" role="alert">{error}</p>}
    </div>
  );
}

export function CloudLibraryInspector({ artifact, busy, preview = true, storageLimit = null, profilePath = null, onProfile, onVisibility, onDelete }: {
  artifact: CloudListItem;
  busy: boolean;
  preview?: boolean;
  storageLimit?: number | null;
  profilePath?: string | null;
  onProfile?: (shown: boolean) => void;
  onVisibility: (visibility: Visibility) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const share = useCloudSharePanel({ id: artifact.id, title: artifact.title, visibility: artifact.visibility, published: artifact.version !== null, onChange: onVisibility, inline: true });
  const title = artifact.title ?? artifact.id;
  const version = Date.parse(artifact.updatedAt);
  const project = artifact.project ?? t('common.other');
  const isPublic = artifact.visibility === 'public';
  const views = useDailyViews(artifact.id, isPublic);
  const size = sizeText(artifact, storageLimit);
  return (
    <>
      <div className="cloud-inspector-head">
        <div className="cloud-row-text">
          <h2 title={title} tabIndex={-1}>{title}</h2>
          <span className="cloud-row-meta">{typeLabels[artifact.type]} · {project} · v{artifact.version}</span>
        </div>
        <a className="cloud-button" href={`/a/${artifact.id}`}>{t('common.open')}<ArrowUpRight size={13} aria-hidden="true" /></a>
      </div>
      {preview && <div className="cloud-preview">
        <ArtifactThumbnail title={title} src={`/a/${artifact.id}/preview?v=${version}`} version={version} />
      </div>}
      {share}
      {isPublic && profilePath && onProfile && <ProfileListing artifact={artifact} profilePath={profilePath} onChange={onProfile} />}
      <dl className="cloud-details">
        <dt>{t('cloudLibrary.updated')}</dt><dd><time dateTime={artifact.updatedAt} title={new Date(artifact.updatedAt).toLocaleString(i18n.language)}>{relativeUpdatedAt(version, Date.now())}</time></dd>
        {artifact.createdAt && <><dt>{t('cloudLibrary.created')}</dt><dd><time dateTime={artifact.createdAt}>{new Date(artifact.createdAt).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' })}</time></dd></>}
        <dt>{t('cloudLibrary.version')}</dt><dd><span className="cloud-mono">v{artifact.version}</span>{artifact.versions !== undefined && <small> · {t('cloudLibrary.versionsPublished', { count: artifact.versions })}</small>}</dd>
        <dt>{t('common.project')}</dt><dd>{project}</dd>
        {size && <><dt>{t('cloudLibrary.size')}</dt><dd>{size}</dd></>}
        <dt>{t('cloudLibrary.pageViews')}</dt>
        <dd>{isPublic
          ? views && <>{t('cloudLibrary.viewsLast30', { count: views.total })}<ViewsSparkline values={views.days.map((day) => day.views)} label={t('cloudLibrary.viewsChart')} /></>
          : <small>{t('cloudLibrary.viewsPrivate')}</small>}</dd>
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
