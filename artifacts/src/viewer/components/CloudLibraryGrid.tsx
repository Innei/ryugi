import { Checkbox } from '@lobehub/ui';
import { Globe, Lock } from 'lucide-react';
import type { MouseEvent } from 'react';
import { relativeUpdatedAt } from '../lib/artifact-list';
import type { CloudListItem } from '../lib/cloud-list';
import { artifactMenuKey } from '../lib/cloud-list-menus';
import { ArtifactThumbnail } from './ArtifactThumbnail';
import { TypeIcon } from './TypeIcon';
import { i18n, useTranslation } from '../i18n';

interface Props {
  items: CloudListItem[];
  inspected: string | null;
  onInspect: (id: string) => void;
  selecting: boolean;
  selected: Set<string>;
  busy: boolean;
  onSelect: (ids: string[], checked: boolean) => void;
  onMenu: (event: MouseEvent, artifact: CloudListItem) => void;
  menuTarget: string | null;
}

export function CloudLibraryGrid({ items, inspected, onInspect, selecting, selected, busy, onSelect, onMenu, menuTarget }: Props) {
  const { t } = useTranslation();
  const now = Date.now();
  return (
    <ul className="cloud-cards">
      {items.map((artifact) => {
        const title = artifact.title ?? artifact.id;
        const version = Date.parse(artifact.updatedAt);
        const isPublic = artifact.visibility === 'public';
        const picked = selected.has(artifact.id);
        return (
          <li key={artifact.id} className={`cloud-card-item${picked ? ' is-picked' : ''}${menuTarget === artifactMenuKey(artifact.id) ? ' is-menu-open' : ''}`}>
            <button type="button" className="cloud-card" disabled={selecting && busy}
              aria-label={selecting ? t('cloudLibrary.toggle', { title }) : undefined}
              aria-pressed={selecting ? picked : artifact.id === inspected}
              onClick={() => selecting ? onSelect([artifact.id], !picked) : onInspect(artifact.id)}
              onDoubleClick={() => { if (!selecting && !busy) location.assign(`/a/${artifact.id}`); }}
              onContextMenu={(event) => onMenu(event, artifact)}>
              <ArtifactThumbnail title={title} src={`/a/${artifact.id}/preview?v=${version}`} version={version} />
              <span className="cloud-card-info">
                <span className="cloud-card-name"><span className="cloud-card-title">{title}</span><TypeIcon type={artifact.type} size={13} /></span>
                <span className="cloud-card-meta">
                  <span className={isPublic ? 'cloud-visibility is-public' : 'cloud-visibility'}>
                    {isPublic ? <Globe size={11} aria-hidden="true" /> : <Lock size={11} aria-hidden="true" />}
                    {isPublic ? t('visibility.withLink') : t('visibility.onlyMe')}
                  </span>
                  <time dateTime={artifact.updatedAt} title={new Date(artifact.updatedAt).toLocaleString(i18n.language)}>{relativeUpdatedAt(version, now)}</time>
                </span>
              </span>
            </button>
            {selecting && <span className="cloud-card-check"><Checkbox aria-label={t('cloudLibrary.select', { title })} checked={picked} disabled={busy} onChange={(checked) => onSelect([artifact.id], checked)} /></span>}
          </li>
        );
      })}
    </ul>
  );
}
