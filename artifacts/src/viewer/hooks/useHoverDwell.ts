import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createHoverDwell, HOVER_DWELL_MS } from '../lib/hover-dwell';
import type { View } from '../lib/view';

interface Client {
  clientX: number;
  clientY: number;
}

const IN_FRAME = { x: -1e9, y: -1e9 };

const dwellLength = () => {
  if (typeof location === 'undefined') return HOVER_DWELL_MS;
  const params = new URLSearchParams(location.search);
  const tuned = Number(params.get('hover'));
  return params.has('debug') && tuned > 0 ? tuned : HOVER_DWELL_MS;
};

export function useHoverDwell({
  scaling,
  view,
  inside = null,
  locate,
}: {
  scaling: boolean;
  view: View;
  inside?: string | null;
  locate: (client: Client) => { board: string | null; x: number; y: number };
}) {
  const [, bump] = useReducer((count: number) => count + 1, 0);
  const [dwell] = useState(() =>
    createHoverDwell({
      dwellMs: dwellLength(),
      schedule: (fn, ms) => window.setTimeout(fn, ms),
      cancel: (id) => window.clearTimeout(id),
      onChange: bump,
    }),
  );
  const last = useRef<Client | null>(null);
  const locateRef = useRef(locate);
  locateRef.current = locate;

  const track = useCallback(
    (client: Client) => {
      last.current = { clientX: client.clientX, clientY: client.clientY };
      const { board, x, y } = locateRef.current(last.current);
      dwell.move(board, { x, y });
    },
    [dwell],
  );
  const leave = useCallback(() => {
    last.current = null;
    dwell.move(null, { x: 0, y: 0 });
  }, [dwell]);

  useEffect(() => () => dwell.dispose(), [dwell]);
  useEffect(() => dwell.setScaling(scaling), [dwell, scaling]);
  useEffect(() => {
    if (!inside) return;
    last.current = null;
    dwell.move(inside, IN_FRAME);
  }, [dwell, inside]);
  useEffect(() => {
    if (last.current && !scaling) track(last.current);
  }, [view.x, view.y, view.k, scaling, track]);

  return { hovered: dwell.current(), track, leave };
}
