import { Checkbox } from '@lobehub/ui';
import { LayoutGrid, List, SquareCheckBig } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ArtifactType } from '../../shared/types';
import { relativeUpdatedAt } from '../lib/artifact-list';
import type { CloudFilter, CloudListItem } from '../lib/cloud-list';
import { CloudLibraryGrid } from './CloudLibraryGrid';
import { TypeIcon } from './TypeIcon';
import { i18n, useTranslation } from '../i18n';

export const typeLabels = { artboard: 'Artboard', document: 'Document', html: 'HTML' };
const TYPES: { value: ArtifactType | undefined; label: string }[] = [
  { value: undefined, label: 'type.all' },
  { value: 'artboard', label: 'type.artboard' },
  { value: 'document', label: 'type.document' },
  { value: 'html', label: 'type.html' },
];

export type CloudView = 'list' | 'grid';

export function CloudLibraryHead({ count, filter, onFilter, view, onView }: { count: number; filter: CloudFilter; onFilter: (next: CloudFilter) => void; view: CloudView; onView: (view: CloudView) => void }) {
  const { t } = useTranslation();
  return (
    <div className="cloud-list-head">
      <h1>{t('cloudLibrary.mine')}</h1>
      <span className="cloud-muted">{t('cloudLibrary.count', { count })}</span>
      <span className="cloud-grow" />
      <span className="cloud-segmented" role="group" aria-label={t('cloudLibrary.filterByType')}>
        {TYPES.map(({ value, label }) => (
          <button key={label} type="button" aria-pressed={filter.type === value} onClick={() => onFilter({ ...filter, type: value })}>{t(label)}</button>
        ))}
      </span>
      <span className="cloud-segmented" role="group" aria-label={t('cloudLibrary.layout')}>
        <button type="button" aria-label={t('cloudLibrary.listView')} title={t('cloudLibrary.listView')} aria-pressed={view === 'list'} onClick={() => onView('list')}><List size={14} aria-hidden="true" /></button>
        <button type="button" aria-label={t('cloudLibrary.gridView')} title={t('cloudLibrary.gridView')} aria-pressed={view === 'grid'} onClick={() => onView('grid')}><LayoutGrid size={14} aria-hidden="true" /></button>
      </span>
    </div>
  );
}

interface Props {
  items: CloudListItem[];
  view: CloudView;
  inspected: string | null;
  onInspect: (id: string) => void;
  selecting: boolean;
  selected: Set<string>;
  busy: boolean;
  onSelect: (ids: string[], checked: boolean) => void;
  onStartSelecting: () => void;
  onClearFilter: () => void;
}

export function CloudLibraryList({ items, view, inspected, onInspect, selecting, selected, busy, onSelect, onStartSelecting, onClearFilter }: Props) {
  const { t } = useTranslation();
  const ids = items.map((item) => item.id);
  const all = ids.length > 0 && ids.every((id) => selected.has(id));
  const some = ids.some((id) => selected.has(id));
  const now = Date.now();
  const section = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    section.current?.querySelector<HTMLElement>(selecting ? `[aria-label="${i18n.t('cloudLibrary.selectAll')}"]` : `button[aria-label="${i18n.t('cloudLibrary.selectMany')}"]`)?.focus();
  }, [selecting]);
  return (
    <section ref={section} className="cloud-list" aria-label={t('cloudLibrary.mine')}>
      <div className={view === 'grid' ? 'cloud-columns is-grid' : 'cloud-columns'}>
        <span className="cloud-check-cell">
          {selecting
            ? <Checkbox aria-label={t('cloudLibrary.selectAll')} checked={all} indeterminate={!all && some} disabled={busy || ids.length === 0} onChange={(checked) => onSelect(ids, checked)} />
            : <button type="button" className="cloud-icon-button" aria-label={t('cloudLibrary.selectMany')} title={t('cloudLibrary.selectMany')} onClick={onStartSelecting}><SquareCheckBig size={14} aria-hidden="true" /></button>}
        </span>
        {view === 'list' && <><span>{t('cloudLibrary.name')}</span><span>{t('cloudLibrary.whoCanSee')}</span><span className="cloud-end">{t('cloudLibrary.updated')}</span></>}
        {view === 'grid' && selecting && <span>{t('cloudLibrary.selectAll')}</span>}
      </div>
      {view === 'grid'
        ? <CloudLibraryGrid items={items} inspected={inspected} onInspect={onInspect} selecting={selecting} selected={selected} busy={busy} onSelect={onSelect} />
        : <ul className="cloud-rows">
        {items.map((artifact) => {
          const title = artifact.title ?? artifact.id;
          const version = Date.parse(artifact.updatedAt);
          const isPublic = artifact.visibility === 'public';
          const picked = selected.has(artifact.id);
          return (
            <li key={artifact.id} className={picked ? 'cloud-row-item is-picked' : 'cloud-row-item'}>
              <button type="button" className="cloud-row" disabled={selecting && busy}
                aria-label={selecting ? t('cloudLibrary.toggle', { title }) : undefined}
                aria-pressed={selecting ? picked : artifact.id === inspected}
                onClick={() => selecting ? onSelect([artifact.id], !picked) : onInspect(artifact.id)}
                onDoubleClick={() => { if (!selecting && !busy) location.assign(`/a/${artifact.id}`); }}>
                <span className="cloud-row-name">
                  <span className="cloud-type-chip"><TypeIcon type={artifact.type} size={13} /></span>
                  <span className="cloud-row-text">
                    <span className="cloud-row-title">{title}</span>
                    <span className="cloud-row-meta">{typeLabels[artifact.type]} · {artifact.project ?? t('common.other')}</span>
                  </span>
                </span>
                <span className={isPublic ? 'cloud-visibility is-public' : 'cloud-visibility'}>{isPublic ? t('visibility.withLink') : t('visibility.onlyMe')}</span>
                <time className="cloud-end" dateTime={artifact.updatedAt} title={new Date(artifact.updatedAt).toLocaleString(i18n.language)}>{relativeUpdatedAt(version, now)}</time>
              </button>
              {selecting && <span className="cloud-row-check"><Checkbox aria-label={t('cloudLibrary.select', { title })} checked={picked} disabled={busy} onChange={(checked) => onSelect([artifact.id], checked)} /></span>}
            </li>
          );
        })}
      </ul>}
      {items.length === 0 && (
        <div className="cloud-list-empty">
          <p>{t('cloudLibrary.noneInFilter')}</p>
          <button type="button" className="cloud-button" onClick={onClearFilter}>{t('common.clearFilter')}</button>
        </div>
      )}
    </section>
  );
}
