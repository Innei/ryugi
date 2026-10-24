import { Folder, Globe, LayoutGrid, Lock, type LucideIcon } from 'lucide-react';
import type { Visibility } from '../../shared/cloud';
import { projectCounts, type CloudFilter, type CloudListItem } from '../lib/cloud-list';
import { useTranslation } from '../i18n';

const VISIBILITY: { value: Visibility | undefined; label: string; Icon: LucideIcon; tone?: string }[] = [
  { value: undefined, label: 'type.all', Icon: LayoutGrid },
  { value: 'public', label: 'visibility.anyoneWithLink', Icon: Globe, tone: 'is-public' },
  { value: 'private', label: 'visibility.onlyMe', Icon: Lock },
];

function SideButton({ pressed, label, count, Icon, tone, onClick }: { pressed: boolean; label: string; count: number; Icon: LucideIcon; tone?: string; onClick: () => void }) {
  return (
    <button type="button" className="cloud-side-button" aria-pressed={pressed} onClick={onClick}>
      <Icon size={14} aria-hidden="true" className={tone} /><span className="cloud-side-label">{label}</span><span className="cloud-count">{count}</span>
    </button>
  );
}

export function CloudLibrarySidebar({ items, filter, onFilter }: { items: CloudListItem[]; filter: CloudFilter; onFilter: (next: CloudFilter) => void }) {
  const { t } = useTranslation();
  return (
    <aside className="cloud-side" aria-label={t('cloudLibrary.filters')}>
      <div className="cloud-side-group">
        <p className="cloud-label">{t('common.project')}</p>
        <SideButton pressed={filter.project === undefined} label={t('type.all')} count={items.length} Icon={Folder} onClick={() => onFilter({ ...filter, project: undefined })} />
        {projectCounts(items).map(({ project, count }) => (
          <SideButton key={project ?? ''} pressed={filter.project === project} label={project ?? t('common.other')} count={count} Icon={Folder} onClick={() => onFilter({ ...filter, project })} />
        ))}
      </div>
      <div className="cloud-side-group">
        <p className="cloud-label">{t('cloudLibrary.whoCanSee')}</p>
        {VISIBILITY.map(({ value, label, Icon, tone }) => (
          <SideButton key={label} pressed={filter.visibility === value} label={t(label)} Icon={Icon} tone={tone}
            count={value ? items.filter((item) => item.visibility === value).length : items.length}
            onClick={() => onFilter({ ...filter, visibility: value })} />
        ))}
      </div>
      <p className="cloud-side-note">{t('cloudLibrary.sideNote')}</p>
    </aside>
  );
}
