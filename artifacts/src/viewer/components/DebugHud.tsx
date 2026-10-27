import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';

import type { BoardRender, BoardTier } from '../lib/board-tiers';

const WINDOW_MS = 1000;
const PUBLISH_MS = 250;
const SLOW_MS = 33;
const TIERS: BoardTier[] = ['live', 'snapshot', 'placeholder', 'empty'];

const styles = stylex.create({
  hud: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    zIndex: 20,
    padding: '6px 10px',
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    color: '#e8e8e8',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    lineHeight: 1.6,
    whiteSpace: 'pre',
    pointerEvents: 'none',
  },
});

export function DebugHud({
  renders,
  scaling,
}: {
  renders: ReadonlyMap<string, BoardRender>;
  scaling: boolean;
}) {
  const [stats, setStats] = useState({ fps: 0, worst: 0, slow: 0 });
  useEffect(() => {
    const deltas: { at: number; ms: number }[] = [];
    let last = performance.now(),
      published = last,
      id = 0;
    const tick = (now: number) => {
      deltas.push({ at: now, ms: now - last });
      last = now;
      while (deltas.length && now - deltas[0]!.at >= WINDOW_MS) deltas.shift();
      if (now - published >= PUBLISH_MS) {
        published = now;
        const span = deltas.reduce((sum, delta) => sum + delta.ms, 0);
        setStats({
          fps: span ? Math.round((deltas.length * 1000) / span) : 0,
          worst: Math.round(Math.max(0, ...deltas.map((delta) => delta.ms))),
          slow: deltas.filter((delta) => delta.ms > SLOW_MS).length,
        });
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  const counts = TIERS.map(
    (tier) => `${tier} ${[...renders.values()].filter((render) => render.tier === tier).length}`,
  );
  return (
    <div aria-hidden="true" data-chrome="debug" {...stylex.props(styles.hud)}>
      {`${stats.fps} fps · worst ${stats.worst} ms · ${stats.slow} slow\n${counts.join(' · ')}${scaling ? ' · zooming' : ''}`}
    </div>
  );
}
