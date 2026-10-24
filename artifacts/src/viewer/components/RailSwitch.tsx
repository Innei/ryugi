import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { History, MessageCircle } from 'lucide-react';

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
    <div role="group" aria-label="侧栏" {...stylex.props(styles.group)}>
      <button type="button" aria-pressed={!open} onClick={() => { if (open) onComments(); }} {...stylex.props(styles.tab, !open && styles.active)}>
        <MessageCircle size={13} aria-hidden="true" />评论 {comments}
      </button>
      <button
        type="button"
        aria-pressed={open}
        disabled={!available}
        title={available ? undefined : '电脑离线，历史暂不可用'}
        onClick={() => { if (!open) onHistory(); }}
        {...stylex.props(styles.tab, open && styles.active)}
      >
        <History size={13} aria-hidden="true" />历史
      </button>
    </div>
  );
}
