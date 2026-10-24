import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { History, MessageCircle } from 'lucide-react';
import { t } from '../i18n';

const styles = stylex.create({
  group: { display: 'flex', gap: 2, padding: 2, borderRadius: 8, backgroundColor: cssVar.colorFillTertiary, flexShrink: 0 },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingBlock: 4,
    paddingInline: 10,
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: { default: cssVar.colorTextSecondary, ':hover': cssVar.colorText },
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    ':disabled': { opacity: 0.45, cursor: 'default' },
    ':focus-visible': { outline: `2px solid ${cssVar.colorInfo}`, outlineOffset: 2 },
  },
  active: { backgroundColor: cssVar.colorBgContainer, color: cssVar.colorText },
});

interface Props {
  comments: number;
  open: boolean;
  available: boolean;
  onComments: () => void;
  onHistory: () => void;
}

export function RailSwitch({ comments, open, available, onComments, onHistory }: Props) {
  return (
    <div role="group" aria-label={t('document.rail')} {...stylex.props(styles.group)}>
      <button type="button" aria-pressed={!open} onClick={() => { if (open) onComments(); }} {...stylex.props(styles.tab, !open && styles.active)}>
        <MessageCircle size={13} aria-hidden="true" />{t('document.railComments', { count: comments })}
      </button>
      <button
        type="button"
        aria-pressed={open}
        disabled={!available}
        title={available ? undefined : t('document.historyOffline')}
        onClick={() => { if (!open) onHistory(); }}
        {...stylex.props(styles.tab, open && styles.active)}
      >
        <History size={13} aria-hidden="true" />{t('document.history')}
      </button>
    </div>
  );
}
