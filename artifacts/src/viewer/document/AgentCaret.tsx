import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AgentCaretPosition } from './LoroSync';

interface Rect {
  left: number;
  top: number;
  height: number;
}

const AGENT = '#7c5cff';

const styles = stylex.create({
  caret: { position: 'absolute', zIndex: 5, pointerEvents: 'none', transitionProperty: 'left, top', transitionDuration: '100ms' },
  bar: { width: 2, height: '100%', borderRadius: 1, backgroundColor: AGENT },
  label: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: 2,
    paddingInline: 4,
    borderRadius: 3,
    backgroundColor: AGENT,
    color: '#fff',
    fontSize: 10,
    fontWeight: 600,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
  },
});

const firstTextNode = (element: HTMLElement) => document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode() as Text | null;

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

export function AgentCaret({ caret, container, agent = 'Agent' }: { caret: AgentCaretPosition | null; container: HTMLElement | null; agent?: string }) {
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
      setRect({ left: at.left - origin.left + container.scrollLeft, top: at.top - origin.top + container.scrollTop, height: at.height });
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
    <div aria-hidden {...stylex.props(styles.caret)} style={{ left: rect.left, top: rect.top, height: rect.height }}>
      <div {...stylex.props(styles.bar)} />
      <span {...stylex.props(styles.label)}>{agent}</span>
    </div>,
    container,
  );
}
