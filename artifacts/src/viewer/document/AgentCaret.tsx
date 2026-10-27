import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { brand } from '../tokens.stylex';
import type { AgentCaretPosition } from './LoroSync';

interface Rect {
  height: number;
  left: number;
  top: number;
}

const styles = stylex.create({
  caret: {
    position: 'absolute',
    zIndex: 5,
    marginInlineStart: -1,
    pointerEvents: 'none',
    transitionProperty: 'left, top',
    transitionDuration: '100ms',
  },
  bar: { width: 3, height: '100%', borderRadius: 2, backgroundColor: brand.accent },
  bead: {
    position: 'absolute',
    top: -5,
    left: -2.5,
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: brand.accent,
    boxShadow: '0 0 0 1.5px #fff',
  },
  label: {
    position: 'absolute',
    bottom: '100%',
    left: 5,
    marginBottom: 1,
    paddingBlock: 1,
    paddingInline: 8,
    borderRadius: '999px 999px 999px 4px',
    backgroundColor: brand.accentStrong,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
  },
});

const firstTextNode = (element: HTMLElement) =>
  document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode() as Text | null;

function measure(element: HTMLElement, offset: number): Rect {
  const text = firstTextNode(element);
  if (text) {
    const range = document.createRange();
    range.setStart(text, Math.min(offset, text.length));
    range.collapse(true);
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    if (rect.height > 0) return { left: rect.left, top: rect.top, height: rect.height };
  }
  const box = element.getBoundingClientRect();
  return { left: box.left, top: box.top, height: Math.min(box.height, 24) };
}

export function AgentCaret({
  caret,
  container,
  agent = 'Agent',
}: {
  caret: AgentCaretPosition | null;
  container: HTMLElement | null;
  agent?: string;
}) {
  const [editor] = useLexicalComposerContext();
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!caret || !container) {
      setRect(null);
      return;
    }
    const update = () => {
      const element = editor.getElementByKey(caret.key);
      if (!element) {
        setRect(null);
        return;
      }
      const at = measure(element, caret.offset);
      const origin = container.getBoundingClientRect();
      setRect({
        left: at.left - origin.left + container.scrollLeft,
        top: at.top - origin.top + container.scrollTop,
        height: at.height,
      });
    };
    update();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const unregister = editor.registerUpdateListener(schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      unregister();
      resize.disconnect();
    };
  }, [editor, caret, container]);

  if (!rect || !container) return null;
  return createPortal(
    <div
      aria-hidden
      {...stylex.props(styles.caret)}
      style={{ left: rect.left, top: rect.top, height: rect.height }}
    >
      <div {...stylex.props(styles.bar)} />
      <div {...stylex.props(styles.bead)} />
      <span {...stylex.props(styles.label)}>{agent}</span>
    </div>,
    container,
  );
}
