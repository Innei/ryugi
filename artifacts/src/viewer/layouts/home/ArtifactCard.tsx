import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ArrowUpRight, Folder } from 'lucide-react';

import type { HubArtifact } from '../../../shared/hub';
import { THUMBNAIL_PATH } from '../../../shared/thumbnail';
import { ArtifactThumbnail } from '../../components/ArtifactThumbnail';
import { TypeIcon } from '../../components/TypeIcon';
import { useTranslation } from '../../i18n';
import { relativeUpdatedAt } from '../../lib/artifact-list';

const styles = stylex.create({
  card: {
    'display': 'block',
    'height': 196,
    'boxSizing': 'border-box',
    'borderWidth': 1,
    'borderStyle': 'solid',
    'borderColor': cssVar.colorBorderSecondary,
    'borderRadius': 8,
    'overflow': 'hidden',
    'backgroundColor': cssVar.colorBgContainer,
    'color': 'inherit',
    'textDecoration': 'none',
    'transitionProperty': 'border-color',
    'transitionDuration': '120ms',
    ':hover': { borderColor: cssVar.colorTextTertiary },
    ':focus-visible': {
      outlineWidth: 2,
      outlineStyle: 'solid',
      outlineColor: cssVar.colorPrimary,
      outlineOffset: 3,
    },
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0s' },
  },
  info: { paddingBlock: 8, paddingInline: 12 },
  title: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 13,
    lineHeight: '18px',
    fontWeight: 550,
  },
  titleText: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  icon: { flexShrink: 0, color: cssVar.colorTextSecondary },
  meta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 3,
    fontSize: 11,
    lineHeight: '16px',
    color: cssVar.colorTextSecondary,
  },
  group: { display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 },
  project: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  time: { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
});

export function ArtifactCard({
  artifact,
  projectName,
  now,
}: {
  artifact: HubArtifact;
  projectName: string | null;
  now: number;
}) {
  const { t, i18n } = useTranslation();
  const updated = new Date(artifact.updatedAt);
  return (
    <a
      aria-label={t('library.open', { title: artifact.title })}
      href={artifact.url}
      {...stylex.props(styles.card)}
    >
      <ArtifactThumbnail
        src={`/api/thumbnail${artifact.url}.svg?v=${artifact.updatedAt}&d=${THUMBNAIL_PATH}`}
        type={artifact.type}
      />
      <div {...stylex.props(styles.info)}>
        <div {...stylex.props(styles.title)}>
          <span title={artifact.title} {...stylex.props(styles.titleText)}>
            {artifact.title}
          </span>
          <ArrowUpRight aria-hidden="true" size={13} {...stylex.props(styles.icon)} />
        </div>
        <div {...stylex.props(styles.meta)}>
          <span {...stylex.props(styles.group)}>
            <TypeIcon size={12} type={artifact.type} />
            {projectName === null ? (
              t(`type.${artifact.type}`)
            ) : (
              <>
                <Folder aria-hidden="true" size={11} />
                <span title={artifact.project} {...stylex.props(styles.project)}>
                  {projectName}
                </span>
              </>
            )}
          </span>
          <time
            dateTime={updated.toISOString()}
            title={updated.toLocaleString(i18n.language)}
            {...stylex.props(styles.time)}
          >
            {relativeUpdatedAt(artifact.updatedAt, now)}
          </time>
        </div>
      </div>
    </a>
  );
}
