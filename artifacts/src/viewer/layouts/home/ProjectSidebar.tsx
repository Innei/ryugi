import { ContextMenuTrigger } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ChevronDown, ChevronRight, Clock, Folder } from 'lucide-react';
import { useState } from 'react';

import type { HubProjectStatus } from '../../../shared/hub';
import { useTranslation } from '../../i18n';
import { type HomeSelection, splitProjects } from './home-model';

const styles = stylex.create({
  side: {
    'boxSizing': 'border-box',
    'width': 232,
    'flexShrink': 0,
    'paddingBlock': 16,
    'paddingInline': 10,
    'borderInlineEndWidth': 1,
    'borderInlineEndStyle': 'solid',
    'borderInlineEndColor': cssVar.colorBorderSecondary,
    'backgroundColor': cssVar.colorBgContainer,
    'overflowY': 'auto',
    '@media (max-width: 700px)': {
      width: '100%',
      display: 'flex',
      gap: 4,
      paddingBlock: 8,
      overflowX: 'auto',
      overflowY: 'hidden',
      borderInlineEndWidth: 0,
      borderBottomWidth: 1,
      borderBottomStyle: 'solid',
      borderBottomColor: cssVar.colorBorderSecondary,
    },
  },
  heading: {
    'margin': '16px 10px 6px',
    'fontSize': 11,
    'fontWeight': 500,
    'color': cssVar.colorTextTertiary,
    '@media (max-width: 700px)': { display: 'none' },
  },
  item: {
    'display': 'flex',
    'alignItems': 'center',
    'gap': 8,
    'width': '100%',
    'boxSizing': 'border-box',
    'height': 30,
    'paddingInline': 10,
    'borderWidth': 0,
    'borderRadius': 6,
    'backgroundColor': { 'default': 'transparent', ':hover': cssVar.colorFillTertiary },
    'color': cssVar.colorTextSecondary,
    'font': 'inherit',
    'fontSize': 13,
    'textAlign': 'start',
    'cursor': 'pointer',
    ':focus-visible': {
      outlineWidth: 2,
      outlineStyle: 'solid',
      outlineColor: cssVar.colorPrimary,
    },
    '@media (max-width: 700px)': { width: 'auto', flexShrink: 0 },
  },
  active: {
    backgroundColor: cssVar.colorFillSecondary,
    color: cssVar.colorText,
    fontWeight: 550,
  },
  name: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  count: {
    fontSize: 11,
    color: cssVar.colorTextTertiary,
    fontVariantNumeric: 'tabular-nums',
  },
  icon: { flexShrink: 0, color: cssVar.colorTextTertiary },
});

export function ProjectSidebar({
  projects,
  total,
  selection,
  onSelect,
  onRemove,
}: {
  projects: HubProjectStatus[];
  total: number;
  selection: HomeSelection;
  onSelect: (selection: HomeSelection) => void;
  onRemove: (project: HubProjectStatus) => void;
}) {
  const { t } = useTranslation();
  const [showDormant, setShowDormant] = useState(false);
  const { active, dormant } = splitProjects(projects);

  const row = (project: HubProjectStatus) => (
    <ContextMenuTrigger
      key={project.dir}
      items={[
        {
          key: 'remove',
          label: t('home.removeProject'),
          danger: true,
          onClick: () => onRemove(project),
        },
      ]}
    >
      <button
        aria-current={selection === project.dir ? 'page' : undefined}
        title={project.dir}
        type="button"
        {...stylex.props(styles.item, selection === project.dir && styles.active)}
        onClick={() => onSelect(project.dir)}
      >
        <Folder aria-hidden="true" size={14} {...stylex.props(styles.icon)} />
        <span {...stylex.props(styles.name)}>{project.name}</span>
        <span {...stylex.props(styles.count)}>{project.artifacts}</span>
      </button>
    </ContextMenuTrigger>
  );

  return (
    <nav aria-label={t('home.projects')} {...stylex.props(styles.side)}>
      <button
        aria-current={selection === 'recent' ? 'page' : undefined}
        type="button"
        {...stylex.props(styles.item, selection === 'recent' && styles.active)}
        onClick={() => onSelect('recent')}
      >
        <Clock aria-hidden="true" size={14} {...stylex.props(styles.icon)} />
        <span {...stylex.props(styles.name)}>{t('home.recentAll')}</span>
        <span {...stylex.props(styles.count)}>{total}</span>
      </button>
      <h2 {...stylex.props(styles.heading)}>{t('home.projects')}</h2>
      {active.map(row)}
      {dormant.length > 0 && (
        <button
          aria-expanded={showDormant}
          type="button"
          {...stylex.props(styles.item)}
          onClick={() => setShowDormant((open) => !open)}
        >
          {showDormant ? (
            <ChevronDown aria-hidden="true" size={14} {...stylex.props(styles.icon)} />
          ) : (
            <ChevronRight aria-hidden="true" size={14} {...stylex.props(styles.icon)} />
          )}
          <span {...stylex.props(styles.name)}>{t('home.dormant')}</span>
          <span {...stylex.props(styles.count)}>{dormant.length}</span>
        </button>
      )}
      {showDormant && dormant.map(row)}
    </nav>
  );
}
