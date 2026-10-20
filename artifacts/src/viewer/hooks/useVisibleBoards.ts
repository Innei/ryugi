import { useEffect, useRef, useState } from 'react';

export function useVisibleBoards(ids: string[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set());
  const key = JSON.stringify(ids);

  useEffect(() => {
    const world = ref.current;
    if (!world) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const boards = [...world.querySelectorAll<HTMLElement>('[data-board]')];
    const current = new Set(boards.map((board) => board.dataset.board!));
    setVisible((previous) => new Set([...previous].filter((id) => current.has(id))));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.board!;
        clearTimeout(timers.get(id));
        timers.delete(id);
        if (entry.isIntersecting) {
          setVisible((previous) => previous.has(id) ? previous : new Set(previous).add(id));
        } else {
          // Keep frames briefly so panning along the viewport edge does not restart them.
          timers.set(id, setTimeout(() => {
            timers.delete(id);
            setVisible((previous) => {
              if (!previous.has(id)) return previous;
              const next = new Set(previous); next.delete(id); return next;
            });
          }, 1000));
        }
      }
    }, { root: world.parentElement, rootMargin: '240px' });
    for (const board of boards) observer.observe(board);
    return () => {
      observer.disconnect();
      for (const timer of timers.values()) clearTimeout(timer);
    };
  }, [key]);

  return { ref, visible };
}
