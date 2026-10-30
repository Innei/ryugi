import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { MessageSquare, PenLine } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';

import { t } from '../i18n';
import { color } from '../tokens.stylex';
import { EASE, play } from './motion';

export const EDIT_MENU_HEIGHT = 44;
export const EDIT_MENU_WIDTH = 170;

const styles = stylex.create({
  menu: {
    position: 'absolute',
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  above: { flexDirection: 'column-reverse' },
  arrow: {
    width: 12,
    height: 12,
    marginInlineStart: 16,
    marginBlock: -6,
    borderRadius: 2,
    backgroundColor: color.overlay,
    transform: 'rotate(45deg)',
  },
  bar: {
    display: 'flex',
    height: EDIT_MENU_HEIGHT,
    paddingInline: 4,
    borderRadius: 12,
    backgroundColor: color.overlay,
    boxShadow: `0 8px 24px ${color.overlayShadow}`,
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: EDIT_MENU_HEIGHT,
    paddingBlock: 0,
    paddingInline: 12,
    borderWidth: 0,
    borderRadius: 10,
    backgroundColor: { 'default': 'transparent', ':active': color.overlayActive },
    color: color.overlayText,
    fontFamily: cssVar.fontFamily,
    fontSize: 14,
    cursor: 'pointer',
  },
  primary: { color: color.white, fontWeight: 600 },
});

interface Props {
  canComment: boolean;
  canEdit: boolean;
  left: number;
  onComment: () => void;
  onEdit: () => void;
  placement: 'below' | 'above';
  top: number;
}

export function PhoneEditMenu({
  left,
  top,
  placement,
  canComment,
  canEdit,
  onComment,
  onEdit,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const items = [
    canComment
      ? { label: t('common.comment'), Icon: MessageSquare, run: onComment, primary: true }
      : null,
    canEdit ? { label: t('document.editText'), Icon: PenLine, run: onEdit, primary: false } : null,
  ].filter((item) => item !== null);

  useLayoutEffect(() => {
    void play(
      ref.current,
      [
        { opacity: 0, transform: 'scale(0.96)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 160, easing: EASE },
    );
  }, []);

  if (items.length === 0) return null;
  return (
    <div
      data-edit-menu
      data-placement={placement}
      ref={ref}
      {...stylex.props(styles.menu, placement === 'above' && styles.above)}
      style={{ left, top, transformOrigin: placement === 'above' ? '22px 100%' : '22px 0' }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <span {...stylex.props(styles.arrow)} />
      <div {...stylex.props(styles.bar)}>
        {items.map(({ label, Icon, run, primary }) => (
          <button
            key={label}
            type="button"
            onClick={run}
            {...stylex.props(styles.button, primary && styles.primary)}
          >
            <Icon aria-hidden size={16} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
