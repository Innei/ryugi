import { useEffect, useState } from 'react';

import { type BoardOrigin, boardOrigin, boardProbeUrl } from '../lib/board-origin';

interface Options {
  boardPath?: string;
  boardPort?: number;
  contentBase: string;
}

export function useBoardOrigin({ contentBase, boardPort, boardPath }: Options): BoardOrigin | null {
  const probing = !/^https?:\/\//.test(contentBase) && !!boardPort && !!boardPath;
  const [reachable, setReachable] = useState<{ port: number; ok: boolean } | null>(null);

  useEffect(() => {
    if (!probing || !boardPort) return;
    let cancelled = false;
    fetch(boardProbeUrl(location, boardPort), { mode: 'no-cors', cache: 'no-store' }).then(
      () => !cancelled && setReachable({ port: boardPort, ok: true }),
      () => !cancelled && setReachable({ port: boardPort, ok: false }),
    );
    return () => {
      cancelled = true;
    };
  }, [probing, boardPort]);

  if (probing && reachable?.port !== boardPort) return null;
  return boardOrigin({
    location,
    contentBase,
    boardPort,
    boardPath,
    reachable: reachable?.ok ?? false,
  });
}
