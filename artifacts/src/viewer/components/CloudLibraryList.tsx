import { Checkbox } from '@lobehub/ui';
import { SquareCheckBig } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ArtifactType } from '../../shared/types';
import { relativeUpdatedAt } from '../lib/artifact-list';
import type { CloudFilter, CloudListItem } from '../lib/cloud-list';
import { TypeIcon } from './TypeIcon';

export const typeLabels = { artboard: 'Artboard', document: 'Document', html: 'HTML' };
const TYPES: { value: ArtifactType | undefined; label: string }[] = [
  { value: undefined, label: '全部' },
  { value: 'artboard', label: 'Artboard' },
  { value: 'document', label: 'Document' },
  { value: 'html', label: 'HTML' },
];

interface Props {
  items: CloudListItem[];
  filter: CloudFilter;
  onFilter: (next: CloudFilter) => void;
  inspected: string | null;
  onInspect: (id: string) => void;
  selecting: boolean;
  selected: Set<string>;
  busy: boolean;
  onSelect: (ids: string[], checked: boolean) => void;
  onStartSelecting: () => void;
  onClearFilter: () => void;
}

export function CloudLibraryList({ items, filter, onFilter, inspected, onInspect, selecting, selected, busy, onSelect, onStartSelecting, onClearFilter }: Props) {
  const ids = items.map((item) => item.id);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = ids.some((id) => selected.has(id));
  const now = Date.now();
  const section = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    section.current?.querySelector<HTMLElement>(selecting ? '[aria-label="全选当前列表"]' : 'button[aria-label="选择多项"]')?.focus();
  }, [selecting]);
  return (
    <section ref={section} className="cloud-list" aria-label="我的 Artifact">
      <div className="cloud-list-head">
        <h1>我的 Artifact</h1>
        <span className="cloud-muted">{items.length} 个</span>
        <span className="cloud-grow" />
        <span className="cloud-segmented" role="group" aria-label="按类型筛选">
          {TYPES.map(({ value, label }) => (
            <button key={label} type="button" aria-pressed={filter.type === value} onClick={() => onFilter({ ...filter, type: value })}>{label}</button>
          ))}
        </span>
      </div>
      <div className="cloud-columns">
        <span className="cloud-check-cell">
          {selecting
            ? <Checkbox aria-label="全选当前列表" checked={all} indeterminate={!all && some} disabled={busy || ids.length === 0} onChange={(checked) => onSelect(ids, checked)} />
            : <button type="button" className="cloud-icon-button" aria-label="选择多项" title="选择多项" onClick={onStartSelecting}><SquareCheckBig size={14} aria-hidden="true" /></button>}
        </span>
        <span>名称</span><span>谁能看到</span><span className="cloud-end">更新</span>
      </div>
      <ul className="cloud-rows">
        {items.map((artifact) => {
          const title = artifact.title ?? artifact.id;
          const version = Date.parse(artifact.updatedAt);
          const isPublic = artifact.visibility === 'public';
          const picked = selected.has(artifact.id);
          return (
            <li key={artifact.id} className={picked ? 'cloud-row-item is-picked' : 'cloud-row-item'}>
              <button type="button" className="cloud-row" disabled={selecting && busy}
                aria-label={selecting ? `切换选择 ${title}` : undefined}
                aria-pressed={selecting ? picked : artifact.id === inspected}
                onClick={() => selecting ? onSelect([artifact.id], !picked) : onInspect(artifact.id)}>
                <span className="cloud-row-name">
                  <span className="cloud-type-chip"><TypeIcon type={artifact.type} size={13} /></span>
                  <span className="cloud-row-text">
                    <span className="cloud-row-title">{title}</span>
                    <span className="cloud-row-meta">{typeLabels[artifact.type]} · {artifact.project ?? '其他'}</span>
                  </span>
                </span>
                <span className={isPublic ? 'cloud-visibility is-public' : 'cloud-visibility'}>{isPublic ? '有链接' : '仅自己'}</span>
                <time className="cloud-end" dateTime={artifact.updatedAt} title={new Date(artifact.updatedAt).toLocaleString()}>{relativeUpdatedAt(version, now)}</time>
              </button>
              {selecting && <span className="cloud-row-check"><Checkbox aria-label={`选择 ${title}`} checked={picked} disabled={busy} onChange={(checked) => onSelect([artifact.id], checked)} /></span>}
            </li>
          );
        })}
      </ul>
      {items.length === 0 && (
        <div className="cloud-list-empty">
          <p>这个筛选下没有 Artifact。</p>
          <button type="button" className="cloud-button" onClick={onClearFilter}>清除筛选</button>
        </div>
      )}
    </section>
  );
}
