import * as stylex from '@stylexjs/stylex';
import { useLayoutEffect, useState } from 'react';

import type { Thread } from '../../shared/comments';
import { color } from '../tokens.stylex';
import { shownThreadIds } from './anchor';
import { blockBar } from './layoutCards';
import { anchorBlocks, type ThreadAnchor } from './useAnchors';

const styles = stylex.create({
  bar: {
    position: 'absolute',
    borderRadius: 2,
    pointerEvents: 'none',
    backgroundColor: color.warningBar,
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  active: { backgroundColor: color.warningStrong },
});

interface Bar {
  height: number;
  id: string;
  key: string;
  left: number;
  top: number;
  width: number;
}

interface Props {
  activeId: string | null;
  anchors: ThreadAnchor[];
  container: HTMLElement | null;
  threads: Thread[];
}

export function BlockBars({ container, anchors, threads, activeId }: Props) {
  const [bars, setBars] = useState<Bar[]>([]);

  useLayoutEffect(() => {
    if (!container) return setBars([]);
    const origin = container.getBoundingClientRect();
    const shown = shownThreadIds(threads, activeId);
    const next: Bar[] = [];
    for (const anchor of anchors) {
      if (!shown.has(anchor.threadId)) continue;
      for (const block of anchorBlocks(anchor)) {
        const box = blockBar(block.element.getBoundingClientRect());
        next.push({
          id: anchor.threadId,
          key: `${anchor.threadId}:${block.id}`,
          left: box.left - origin.left,
          top: box.top - origin.top,
          width: box.right - box.left,
          height: box.bottom - box.top,
        });
      }
    }
    setBars(next);
  }, [container, anchors, threads, activeId]);

  return bars.map((bar) => (
    <div
      data-comment-block={bar.id}
      key={bar.key}
      {...stylex.props(styles.bar, bar.id === activeId && styles.active)}
      style={{ left: bar.left, top: bar.top, width: bar.width, height: bar.height }}
    />
  ));
}
