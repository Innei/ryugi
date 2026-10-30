import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import type { Ref } from 'react';

import { t } from '../i18n';
import { PanelFrame } from './CommentCard';
import { Composer } from './Composer';

export const DRAFT_WIDTH = 340;
export const LEAVE_MS = 120;

const drop = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(-6px)' },
  to: { opacity: 1, transform: 'none' },
});

const fade = stylex.keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const styles = stylex.create({
  popover: {
    position: 'absolute',
    zIndex: 5,
    width: DRAFT_WIDTH,
    animationName: drop,
    animationDuration: '180ms',
    animationTimingFunction: 'cubic-bezier(.2,.8,.2,1)',
    animationFillMode: 'both',
  },
  leaving: {
    animationName: fade,
    animationDuration: `${LEAVE_MS}ms`,
    animationTimingFunction: 'ease-in',
    pointerEvents: 'none',
  },
  head: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    paddingTop: 12,
    paddingInline: 16,
    fontFamily: cssVar.fontFamily,
    fontSize: 11,
  },
  quote: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: cssVar.colorTextTertiary,
  },
  restored: { flexShrink: 0, color: cssVar.colorWarningText },
});

interface Props {
  initial: string;
  leaving: boolean;
  left: number;
  onCancel: () => void;
  onChange: (text: string) => void;
  onSubmit: (text: string) => void | Promise<boolean>;
  quote: string;
  ref?: Ref<HTMLDivElement>;
  restored: boolean;
  top: number;
  wholeBlock?: boolean;
}

export function DraftPanel({
  left,
  top,
  quote,
  wholeBlock,
  initial,
  restored,
  leaving,
  onChange,
  onSubmit,
  onCancel,
  ref,
}: Props) {
  return (
    <div
      ref={ref}
      {...stylex.props(styles.popover, leaving && styles.leaving)}
      style={{ left, top }}
    >
      <PanelFrame active>
        <div {...stylex.props(styles.head)}>
          <span {...stylex.props(styles.quote)}>{wholeBlock ? quote : `“${quote}”`}</span>
          {restored ? (
            <span {...stylex.props(styles.restored)}>{t('document.draftRestored')}</span>
          ) : null}
        </div>
        <Composer
          autoFocus
          initial={initial}
          placeholder={t('document.draftPlaceholder')}
          onCancel={onCancel}
          onChange={onChange}
          onSubmit={onSubmit}
        />
      </PanelFrame>
    </div>
  );
}
