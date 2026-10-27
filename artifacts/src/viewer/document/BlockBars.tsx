import * as stylex from '@stylexjs/stylex';
import { useLayoutEffect, useState } from 'react';

import type { Thread } from '../../shared/comments';
import { shownThreadIds } from './anchor';
import { anchorBoxes, type ThreadAnchor } from './useAnchors';

const styles = stylex.create({
  bar: {
    position: 'absolute',
    borderRadius: 2,
    pointerEvents: 'none',
    backgroundColor: 'rgba(240, 194, 75, 0.45)',
    transitionProperty: 'background-color',
    transitionDuration: '150ms',
  },
  active: { backgroundColor: '#c9a03a' },
});

interface Bar {
  height: number;
  id: string;
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
      if (anchor.kind !== 'block' || !shown.has(anchor.threadId)) continue;
      const [box] = anchorBoxes(anchor);
      if (!box) continue;
      next.push({
        id: anchor.threadId,
        left: box.left - origin.left,
        top: box.top - origin.top,
        width: box.right - box.left,
        height: box.bottom - box.top,
      });
    }
    setBars(next);
  }, [container, anchors, threads, activeId]);

  return bars.map((bar) => (
    <div
      key={bar.id}
      {...stylex.props(styles.bar, bar.id === activeId && styles.active)}
      style={{ left: bar.left, top: bar.top, width: bar.width, height: bar.height }}
    />
  ));
}
