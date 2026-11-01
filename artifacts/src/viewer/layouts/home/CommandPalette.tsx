import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { CircleArrowOutUpLeft, Command, CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { HubArtifact, HubProjectStatus } from '../../../shared/hub';
import { TypeIcon } from '../../components/TypeIcon';
import { useTranslation } from '../../i18n';
import { paletteGroups } from './home-model';

const PER_GROUP = 8;

const styles = stylex.create({
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: '12vh',
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
  },
  panel: {
    width: 'min(560px, calc(100vw - 32px))',
    maxHeight: '64vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: cssVar.colorBgElevated,
    boxShadow: cssVar.boxShadowSecondary,
    fontFamily: cssVar.fontFamily,
    color: cssVar.colorText,
  },
  field: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    paddingInline: 16,
    height: 48,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    color: cssVar.colorTextTertiary,
  },
  input: {
    flexGrow: 1,
    borderWidth: 0,
    outline: 'none',
    backgroundColor: 'transparent',
    color: cssVar.colorText,
    font: 'inherit',
    fontSize: 14,
  },
  results: { overflowY: 'auto', paddingBlock: 6 },
  groupLabel: {
    paddingInline: 16,
    paddingBlock: 6,
    fontSize: 11,
    fontWeight: 500,
    color: cssVar.colorTextTertiary,
  },
  option: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginInline: 6,
    paddingInline: 10,
    height: 34,
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
  optionActive: { backgroundColor: cssVar.colorFillSecondary },
  optionTitle: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  optionId: { fontSize: 11, color: cssVar.colorTextTertiary },
  empty: { padding: 24, textAlign: 'center', color: cssVar.colorTextSecondary, fontSize: 13 },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 14,
    paddingInline: 16,
    height: 34,
    alignItems: 'center',
    fontSize: 11,
    color: cssVar.colorTextTertiary,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: cssVar.colorBorderSecondary,
  },
  hint: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  keys: { display: 'inline-flex', gap: 2 },
  kbd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    height: 18,
    boxSizing: 'border-box',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorderSecondary,
    borderRadius: 4,
    color: cssVar.colorTextSecondary,
  },
});

export function CommandPalette({
  artifacts,
  projects,
  onOpen,
  onClose,
}: {
  artifacts: HubArtifact[];
  projects: HubProjectStatus[];
  onOpen: (artifact: HubArtifact, newTab: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = paletteGroups(artifacts, projects, query).map((group) => ({
    ...group,
    items: group.items.slice(0, PER_GROUP),
  }));
  const flat = groups.flatMap((group) => group.items);
  const starts = groups.map((_, at) =>
    groups.slice(0, at).reduce((sum, group) => sum + group.items.length, 0),
  );

  useEffect(() => inputRef.current?.focus(), []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (flat.length ? (index + step + flat.length) % flat.length : 0));
    } else if (event.key === 'Enter' && flat[active]) {
      event.preventDefault();
      onOpen(flat[active], event.metaKey || event.ctrlKey);
    }
  };

  return (
    <div
      {...stylex.props(styles.backdrop)}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        aria-label={t('home.paletteLabel')}
        aria-modal="true"
        role="dialog"
        {...stylex.props(styles.panel)}
      >
        <label {...stylex.props(styles.field)}>
          <Search aria-hidden="true" size={16} />
          <input
            aria-activedescendant={flat[active] ? `palette-${active}` : undefined}
            aria-controls="palette-results"
            aria-expanded="true"
            aria-label={t('home.paletteLabel')}
            placeholder={t('home.palettePlaceholder')}
            ref={inputRef}
            role="combobox"
            value={query}
            {...stylex.props(styles.input)}
            onKeyDown={onKeyDown}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
          />
        </label>
        <div id="palette-results" role="listbox" {...stylex.props(styles.results)}>
          {flat.length === 0 && <p {...stylex.props(styles.empty)}>{t('home.paletteEmpty')}</p>}
          {groups.map((group, groupAt) => (
            <div aria-label={group.project.name} key={group.project.dir} role="group">
              <div aria-hidden="true" {...stylex.props(styles.groupLabel)}>
                {group.project.name}
              </div>
              {group.items.map((artifact, itemAt) => {
                const position = starts[groupAt]! + itemAt;
                return (
                  <div
                    aria-selected={position === active}
                    id={`palette-${position}`}
                    key={`${artifact.type}/${artifact.id}`}
                    role="option"
                    {...stylex.props(styles.option, position === active && styles.optionActive)}
                    onClick={(event) => onOpen(artifact, event.metaKey || event.ctrlKey)}
                    onMouseMove={() => setActive(position)}
                  >
                    <TypeIcon size={14} type={artifact.type} />
                    <span {...stylex.props(styles.optionTitle)}>{artifact.title}</span>
                    <span {...stylex.props(styles.optionId)}>{artifact.id}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div {...stylex.props(styles.footer)}>
          <span {...stylex.props(styles.hint)}>
            <kbd aria-label="Enter" {...stylex.props(styles.kbd)}>
              <CornerDownLeft aria-hidden="true" size={11} />
            </kbd>
            {t('home.paletteOpen')}
          </span>
          <span {...stylex.props(styles.hint)}>
            <span {...stylex.props(styles.keys)}>
              <kbd aria-label="Command" {...stylex.props(styles.kbd)}>
                <Command aria-hidden="true" size={11} />
              </kbd>
              <kbd aria-label="Enter" {...stylex.props(styles.kbd)}>
                <CornerDownLeft aria-hidden="true" size={11} />
              </kbd>
            </span>
            {t('home.paletteNewTab')}
          </span>
          <span {...stylex.props(styles.hint)}>
            <kbd aria-label="Escape" {...stylex.props(styles.kbd)}>
              <CircleArrowOutUpLeft aria-hidden="true" size={11} />
            </kbd>
            {t('common.close')}
          </span>
        </div>
      </div>
    </div>
  );
}
