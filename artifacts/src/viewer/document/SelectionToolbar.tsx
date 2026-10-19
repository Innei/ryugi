import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { MessageSquare } from 'lucide-react';
import type { Ref } from 'react';

export const TOOLBAR_WIDTH = 138;
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
    gap: 2,
    height: TOOLBAR_HEIGHT,
    boxSizing: 'border-box',
    padding: 4,
    borderRadius: 10,
    backgroundColor: cssVar.colorBgSpotlight,
    boxShadow: cssVar.boxShadowSecondary,
    animationName: rise,
    animationDuration: '140ms',
    animationTimingFunction: 'ease-out',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingBlock: 0,
    paddingInline: 10,
    borderWidth: 0,
    borderRadius: 7,
    backgroundColor: { default: 'transparent', ':hover': 'rgba(255, 255, 255, 0.12)' },
    color: cssVar.colorTextLightSolid,
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    cursor: 'pointer',
  },
  secondary: { opacity: 0.7 },
});

interface Props {
  left: number;
  top: number;
  onComment: () => void;
  onCopy: () => void;
  ref?: Ref<HTMLDivElement>;
}

export function SelectionToolbar({ left, top, onComment, onCopy, ref }: Props) {
  return (
    <div ref={ref} {...stylex.props(styles.bar)} style={{ left, top }} onMouseDown={(event) => event.preventDefault()}>
      <button type="button" onClick={onComment} {...stylex.props(styles.button)}>
        <MessageSquare size={14} />
        评论
      </button>
      <button type="button" onClick={onCopy} {...stylex.props(styles.button, styles.secondary)}>
        复制
      </button>
    </div>
  );
}
