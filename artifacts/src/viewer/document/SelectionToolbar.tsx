import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { MessageSquare } from 'lucide-react';
import type { Ref } from 'react';

import { t } from '../i18n';
import { brand } from '../tokens.stylex';

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
      'default': 'transparent',
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
    outlineColor: { 'default': 'transparent', ':focus-visible': brand.accent },
  },
  secondary: { color: cssVar.colorTextSecondary },
  icon: { flexShrink: 0, color: brand.accent },
  blockButton: {
    position: 'absolute',
    zIndex: 5,
    display: 'grid',
    placeItems: 'center',
    width: 32,
    height: 32,
    padding: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: cssVar.colorBorder,
    borderRadius: 8,
    backgroundColor: { 'default': cssVar.colorBgElevated, ':hover': cssVar.colorFillTertiary },
    color: brand.accent,
    boxShadow: cssVar.boxShadowSecondary,
    cursor: 'pointer',
    outlineColor: brand.accent,
    outlineOffset: 2,
  },
  blockWrap: { position: 'absolute', zIndex: 5 },
  divider: {
    flexShrink: 0,
    width: 1,
    height: 16,
    marginInline: 3,
    backgroundColor: cssVar.colorBorder,
  },
});

export function BlockCommentButton({
  left,
  top,
  onComment,
  ref,
}: {
  left: number;
  top: number;
  onComment: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={ref} {...stylex.props(styles.blockWrap)} style={{ left, top }}>
      <button
        aria-label={t('common.comment')}
        title={t('common.comment')}
        type="button"
        {...stylex.props(styles.blockButton)}
        onClick={onComment}
        onPointerDown={(event) => event.preventDefault()}
      >
        <MessageSquare aria-hidden="true" size={16} />
      </button>
    </div>
  );
}

interface Props {
  left: number;
  onComment?: () => void;
  onCopy: () => void;
  ref?: Ref<HTMLDivElement>;
  top: number;
}

export function SelectionToolbar({ left, top, onComment, onCopy, ref }: Props) {
  return (
    <div
      ref={ref}
      {...stylex.props(styles.bar)}
      style={{ left, top }}
      onMouseDown={(event) => event.preventDefault()}
    >
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
