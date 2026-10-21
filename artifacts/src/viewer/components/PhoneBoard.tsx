import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { X } from 'lucide-react';
import { useLayoutEffect } from 'react';
import type { BoardSpec } from '../../shared/types';
import { usePanZoom } from '../hooks/usePanZoom';

const styles = stylex.create({
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 30,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: cssVar.colorBgLayout,
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
  },
  head: {
    flexShrink: 0,
    height: 52,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingInline: 16,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    fontSize: 14,
  },
  id: { flexShrink: 0, fontFamily: cssVar.fontFamilyCode, fontSize: 13 },
  title: { minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: cssVar.colorTextSecondary },
  spacer: { flex: 1 },
  close: { display: 'grid', placeItems: 'center', padding: 4, borderWidth: 0, backgroundColor: 'transparent', color: cssVar.colorText, cursor: 'pointer' },
  body: { position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', touchAction: 'none' },
  world: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0' },
  frame: { display: 'block', borderWidth: 0, backgroundColor: '#fff' },
  foot: {
    flexShrink: 0,
    height: 48,
    display: 'flex',
    alignItems: 'center',
    paddingInline: 16,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: cssVar.colorBorderSecondary,
    fontSize: 13,
  },
  step: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: { default: cssVar.colorText, ':disabled': cssVar.colorTextQuaternary },
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    cursor: { default: 'pointer', ':disabled': 'default' },
  },
  count: { color: cssVar.colorTextTertiary, fontVariantNumeric: 'tabular-nums' },
});

interface Props {
  id: string;
  board: BoardSpec;
  src: string;
  siblings: string[];
  onOpen: (id: string) => void;
  onClose: () => void;
}

export function PhoneBoard({ id, board, src, siblings, onOpen, onClose }: Props) {
  const { viewportRef, view, place, handlers } = usePanZoom('hand');
  const index = siblings.indexOf(id);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 ? siblings[index + 1] : undefined;

  useLayoutEffect(() => {
    const width = viewportRef.current?.clientWidth ?? board.w;
    const k = Math.min(1, width / board.w);
    place({ k, x: (width - board.w * k) / 2, y: 0 });
  }, [id, board.w, place, viewportRef]);

  return (
    <div data-phone-board {...stylex.props(styles.overlay)}>
      <div {...stylex.props(styles.head)}>
        <code {...stylex.props(styles.id)}>{id}</code>
        <span {...stylex.props(styles.title)}>{board.title ?? ''}</span>
        <span {...stylex.props(styles.spacer)} />
        <button type="button" aria-label="关闭" onClick={onClose} {...stylex.props(styles.close)}>
          <X size={18} />
        </button>
      </div>
      <div ref={viewportRef} {...handlers} {...stylex.props(styles.body)}>
        <div {...stylex.props(styles.world)} style={{ width: board.w, height: board.h, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <iframe
            key={id}
            title={board.title ?? id}
            src={src}
            sandbox="allow-scripts"
            {...stylex.props(styles.frame)}
            style={{ width: board.w, height: board.h, pointerEvents: board.interactive ? 'auto' : 'none' }}
          />
        </div>
      </div>
      {siblings.length > 1 ? (
        <div {...stylex.props(styles.foot)}>
          <button type="button" disabled={!previous} onClick={() => previous && onOpen(previous)} {...stylex.props(styles.step)}>
            ‹ 上一张
          </button>
          <span {...stylex.props(styles.spacer)} />
          <span {...stylex.props(styles.count)}>
            {index + 1} / {siblings.length}
          </span>
          <span {...stylex.props(styles.spacer)} />
          <button type="button" disabled={!next} onClick={() => next && onOpen(next)} {...stylex.props(styles.step)}>
            下一张 ›
          </button>
        </div>
      ) : null}
    </div>
  );
}
