import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { History, MessageCircle } from 'lucide-react';

import { t } from '../i18n';

const styles = stylex.create({
  group: {
    display: 'flex',
    gap: 2,
    padding: 2,
    borderRadius: 8,
    backgroundColor: cssVar.colorFillTertiary,
    flexShrink: 0,
  },
  tab: {
    'display': 'flex',
    'alignItems': 'center',
    'gap': 6,
    'paddingBlock': 4,
    'paddingInline': 10,
    'borderWidth': 0,
    'borderRadius': 6,
    'backgroundColor': 'transparent',
    'color': { 'default': cssVar.colorTextSecondary, ':hover': cssVar.colorText },
    'fontFamily': cssVar.fontFamily,
    'fontSize': 12,
    'fontVariantNumeric': 'tabular-nums',
    'whiteSpace': 'nowrap',
    'cursor': 'pointer',
    ':disabled': { opacity: 0.45, cursor: 'default' },
    ':focus-visible': { outline: `2px solid ${cssVar.colorInfo}`, outlineOffset: 2 },
  },
  active: { backgroundColor: cssVar.colorBgContainer, color: cssVar.colorText },
  compact: { gap: 5, minWidth: 32, justifyContent: 'center', paddingInline: 8 },
});

interface Props {
  available: boolean;
  comments: number;
  compact?: boolean;
  onComments: () => void;
  onHistory: () => void;
  open: boolean;
}

export function RailSwitch({
  comments,
  open,
  available,
  onComments,
  onHistory,
  compact = false,
}: Props) {
  const commentsLabel = t('document.railComments', { count: comments });
  const historyLabel = t('document.history');
  return (
    <div aria-label={t('document.rail')} role="group" {...stylex.props(styles.group)}>
      <button
        aria-label={compact ? commentsLabel : undefined}
        aria-pressed={!open}
        title={compact ? commentsLabel : undefined}
        type="button"
        onClick={() => {
          if (open) onComments();
        }}
        {...stylex.props(styles.tab, compact && styles.compact, !open && styles.active)}
      >
        <MessageCircle aria-hidden="true" size={13} />
        {compact ? comments : commentsLabel}
      </button>
      <button
        aria-label={compact ? historyLabel : undefined}
        aria-pressed={open}
        disabled={!available}
        title={available ? (compact ? historyLabel : undefined) : t('document.historyOffline')}
        type="button"
        onClick={() => {
          if (!open) onHistory();
        }}
        {...stylex.props(styles.tab, compact && styles.compact, open && styles.active)}
      >
        <History aria-hidden="true" size={13} />
        {compact ? null : historyLabel}
      </button>
    </div>
  );
}
