import { Folder, Globe, LayoutGrid, Lock, type LucideIcon } from 'lucide-react';
import type { Visibility } from '../../shared/cloud';
import { projectCounts, type CloudFilter, type CloudListItem } from '../lib/cloud-list';

const VISIBILITY: { value: Visibility | undefined; label: string; Icon: LucideIcon; tone?: string }[] = [
  { value: undefined, label: '全部', Icon: LayoutGrid },
  { value: 'public', label: '有链接的人', Icon: Globe, tone: 'is-public' },
  { value: 'private', label: '仅自己', Icon: Lock },
];

function SideButton({ pressed, label, count, Icon, tone, onClick }: { pressed: boolean; label: string; count: number; Icon: LucideIcon; tone?: string; onClick: () => void }) {
  return (
    <button type="button" className="cloud-side-button" aria-pressed={pressed} onClick={onClick}>
      <Icon size={14} aria-hidden="true" className={tone} /><span className="cloud-side-label">{label}</span><span className="cloud-count">{count}</span>
    </button>
  );
}

export function CloudLibrarySidebar({ items, filter, onFilter }: { items: CloudListItem[]; filter: CloudFilter; onFilter: (next: CloudFilter) => void }) {
  return (
    <aside className="cloud-side" aria-label="筛选">
      <div className="cloud-side-group">
        <p className="cloud-label">项目</p>
        <SideButton pressed={filter.project === undefined} label="全部" count={items.length} Icon={Folder} onClick={() => onFilter({ ...filter, project: undefined })} />
        {projectCounts(items).map(({ project, count }) => (
          <SideButton key={project ?? ''} pressed={filter.project === project} label={project ?? '其他'} count={count} Icon={Folder} onClick={() => onFilter({ ...filter, project })} />
        ))}
      </div>
      <div className="cloud-side-group">
        <p className="cloud-label">谁能看到</p>
        {VISIBILITY.map(({ value, label, Icon, tone }) => (
          <SideButton key={label} pressed={filter.visibility === value} label={label} Icon={Icon} tone={tone}
            count={value ? items.filter((item) => item.visibility === value).length : items.length}
            onClick={() => onFilter({ ...filter, visibility: value })} />
        ))}
      </div>
      <p className="cloud-side-note">删除只移除云端副本，本地源文件保留。</p>
    </aside>
  );
}
