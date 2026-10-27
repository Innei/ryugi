import { useLayoutEffect, useRef, useState } from 'react';

import { EASE, EXIT, play, spring } from './motion';

const OPEN = spring(260, 28);
const FOLD_MS = 260;

export function useReplyPresence(open: boolean) {
  const [shown, setShown] = useState(open);
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  if (open && !shown) setShown(true);

  useLayoutEffect(() => {
    const box = outer.current;
    const content = inner.current;
    if (!box || !content) return;
    let cancelled = false;
    const height = box.offsetHeight;
    if (open) {
      void play(box, [{ height: '0px' }, { height: `${height}px` }], OPEN);
      void play(
        content,
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'none' },
        ],
        OPEN,
      );
    } else {
      void Promise.all([
        play(box, [{ height: `${height}px` }, { height: '0px' }], { duration: 140, easing: EXIT }),
        play(content, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: 'linear' }),
      ]).then(() => {
        if (!cancelled) setShown(false);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open, shown]);

  return { shown, outer, inner };
}

export function useFold(folded: boolean) {
  const frame = useRef<HTMLDivElement>(null);
  const lastHeight = useRef(0);

  useLayoutEffect(() => {
    const el = frame.current;
    const from = lastHeight.current;
    if (!el || !from) return;
    const to = el.offsetHeight;
    if (from === to) return;
    el.style.overflow = 'hidden';
    void play(el, [{ height: `${from}px` }, { height: `${to}px` }], {
      duration: FOLD_MS,
      easing: EASE,
    }).then(() => {
      el.style.overflow = '';
    });
    void play(el.firstElementChild, [{ opacity: 0 }, { opacity: 1 }], {
      duration: folded ? 140 : 160,
      delay: FOLD_MS,
      easing: 'ease-out',
    });
  }, [folded]);

  useLayoutEffect(() => {
    if (frame.current) lastHeight.current = frame.current.offsetHeight;
  });

  return frame;
}
