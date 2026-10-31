import { useMemo } from 'react';

import type { BoardSpec } from '../../shared/types';
import { culledBoards } from '../lib/cull';
import type { View } from '../lib/view';

export function useCulledBoards(
  boards: [string, BoardSpec][],
  view: View,
  viewport: { width: number; height: number },
): ReadonlySet<string> {
  const ids = [
    ...culledBoards(
      boards.map(([id, board]) => ({ id, ...board })),
      view,
      viewport,
    ),
  ]
    .sort()
    .join(' ');
  return useMemo(() => new Set(ids ? ids.split(' ') : []), [ids]);
}
