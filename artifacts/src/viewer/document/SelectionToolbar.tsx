import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { MessageSquare } from 'lucide-react';
import type { Ref } from 'react';
import { brand } from '../tokens.stylex';
import { t } from '../i18n';

export const TOOLBAR_WIDTH = 128;
export const TOOLBAR_HEIGHT = 36;

const rise = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(4px)' },
  to: { opacity: 1, transform: 'none' },
});

const styles = stylex.create({
  bar: {
    position: 'absolute',
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    height: TOOLBAR_HEIGHT,
    boxSizing: 'border-box',
    padding: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorder,
    borderRadius: 10,
    backgroundColor: cssVar.colorBgElevated,
    boxShadow: cssVar.boxShadowSecondary,
    animationName: rise,
    animationDuration: '140ms',
    animationTimingFunction: 'ease-out',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingBlock: 0,
    paddingInline: 10,
    borderWidth: 0,
    borderRadius: 7,
    backgroundColor: {
      default: 'transparent',
      ':hover': cssVar.colorFillTertiary,
      ':active': cssVar.colorFillSecondary,
    },
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    outlineWidth: 2,
    outlineStyle: 'solid',
    outlineOffset: 1,
    outlineColor: { default: 'transparent', ':focus-visible': brand.accent },
  },
  secondary: { color: cssVar.colorTextSecondary },
  icon: { flexShrink: 0, color: brand.accent },
  divider: { flexShrink: 0, width: 1, height: 16, marginInline: 3, backgroundColor: cssVar.colorBorder },
});

interface Props {
  left: number;
  top: number;
  onComment?: () => void;
  onCopy: () => void;
  ref?: Ref<HTMLDivElement>;
}

export function SelectionToolbar({ left, top, onComment, onCopy, ref }: Props) {
  return (
    <div ref={ref} {...stylex.props(styles.bar)} style={{ left, top }} onMouseDown={(event) => event.preventDefault()}>
      {onComment ? (
        <>
          <button type="button" onClick={onComment} {...stylex.props(styles.button)}>
            <MessageSquare size={14} {...stylex.props(styles.icon)} />
            {t('common.comment')}
          </button>
          <span aria-hidden="true" {...stylex.props(styles.divider)} />
        </>
      ) : null}
      <button type="button" onClick={onCopy} {...stylex.props(styles.button, styles.secondary)}>
        {t('document.copy')}
      </button>
    </div>
  );
}
