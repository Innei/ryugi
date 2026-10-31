import * as stylex from '@stylexjs/stylex';
import { useEffect, useState } from 'react';

import { color } from '../tokens.stylex';

const WINDOW_MS = 1000;
const PUBLISH_MS = 250;
const SLOW_MS = 33;

const styles = stylex.create({
  hud: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    zIndex: 20,
    padding: '6px 10px',
    borderRadius: 6,
    backgroundColor: color.debug,
    color: color.debugText,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    lineHeight: 1.6,
    whiteSpace: 'pre',
    pointerEvents: 'none',
  },
});

interface BoardCounts {
  capturing: number;
  mounted: number;
  restoring: number;
  uncapturable: number;
  unloaded: number;
}

export function DebugHud({
  counts,
  culled,
  gesturing,
}: {
  counts: BoardCounts;
  culled: number;
  gesturing: boolean;
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
  const states = [
    `mounted ${counts.mounted}`,
    `capturing ${counts.capturing}`,
    `unloaded ${counts.unloaded}`,
    `restoring ${counts.restoring}`,
    `culled ${culled}`,
    `uncapturable ${counts.uncapturable}`,
  ];
  return (
    <div aria-hidden="true" data-chrome="debug" {...stylex.props(styles.hud)}>
      {`${stats.fps} fps · worst ${stats.worst} ms · ${stats.slow} slow\n${states.join(' · ')}${gesturing ? ' · gesture' : ''}`}
    </div>
  );
}
