import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardSpec } from '../../shared/types';
import { keepBoard, pruneKept, type KeptBoard } from '../lib/kept-boards';

export function useKeptBoards(
  boards: [string, BoardSpec][],
  versions: Record<string, number>,
  accepts: (id: string) => boolean = () => true,
): ReadonlySet<string> {
  const [list, setList] = useState<KeptBoard[]>([]);
  const current = useMemo(
    () => new Map(boards.map(([id, board]) => [id, versions[board.file] ?? 0])),
    [boards, versions],
  );
  const currentRef = useRef(current);
  currentRef.current = current;
  const acceptsRef = useRef(accepts);
  acceptsRef.current = accepts;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'ryugi:board:interacted' || !event.source) return;
      const frame = [...document.querySelectorAll<HTMLIFrameElement>('[data-board] iframe')].find(
        (element) => element.contentWindow === event.source,
      );
      const id = frame?.closest<HTMLElement>('[data-board]')?.dataset.board;
      const version = id === undefined ? undefined : currentRef.current.get(id);
      if (id === undefined || version === undefined || !acceptsRef.current(id)) return;
      setList((previous) =>
        previous.at(-1)?.id === id && previous.at(-1)?.version === version
          ? previous
          : keepBoard(previous, id, version),
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const pruned = pruneKept(list, current);
  useEffect(() => {
    if (pruned !== list) setList(pruned);
  }, [pruned, list]);
  return useMemo(() => new Set(pruned.map((entry) => entry.id)), [pruned]);
}
