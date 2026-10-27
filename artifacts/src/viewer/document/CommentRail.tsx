import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Thread } from '../../shared/comments';
import { shownThreadIds } from './anchor';
import { CommentCard, type ThreadActions } from './CommentCard';
import { connectorPath, layoutCards } from './layoutCards';
import { anchorLinkStart, type ThreadAnchor } from './useAnchors';
import { t } from '../i18n';

const GAP = 12;
const BEND = 40;
const CONNECT_Y = 18;

const styles = stylex.create({
  wide: { position: 'relative', width: '100%', flexShrink: 0 },
  narrow: {
    display: 'flex',
    flexDirection: 'column',
    gap: GAP,
    width: '100%',
    maxWidth: 680,
    marginInline: 'auto',
  },
  placed: {
    position: 'absolute',
    left: 0,
    width: '100%',
    transitionProperty: 'top',
    transitionDuration: '150ms',
  },
  section: {
    marginTop: 24,
    marginBottom: 8,
    color: cssVar.colorTextTertiary,
    fontFamily: cssVar.fontFamily,
    fontSize: 11,
  },
  links: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    overflow: 'visible',
    pointerEvents: 'none',
  },
});

interface Props {
  agent?: string;
  narrow: boolean;
  threads: Thread[];
  anchors: ThreadAnchor[];
  activeId: string | null;
  actions?: ThreadActions;
  onActivate: (threadId: string) => void;
  railRef: (element: HTMLDivElement | null) => void;
}

interface Link {
  id: string;
  d: string;
}

function Measured({
  id,
  onHeight,
  children,
}: {
  id: string;
  onHeight: (id: string, height: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => onHeight(id, element.offsetHeight));
    observer.observe(element);
    onHeight(id, element.offsetHeight);
    return () => observer.disconnect();
  }, [id, onHeight]);
  return <div ref={ref}>{children}</div>;
}

export function CommentRail({
  narrow,
  threads,
  anchors,
  activeId,
  actions,
  onActivate,
  railRef,
  agent,
}: Props) {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [links, setLinks] = useState<Link[]>([]);
  const own = useRef<HTMLDivElement | null>(null);
  const onHeight = useRef((id: string, height: number) =>
    setHeights((prev) => (prev[id] === height ? prev : { ...prev, [id]: height })),
  ).current;
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      own.current = element;
      railRef(element);
    },
    [railRef],
  );
  const topOf = new Map(anchors.map((anchor) => [anchor.threadId, anchor.top]));
  const placed = threads.filter((thread) => topOf.has(thread.id));
  const orphaned = threads.filter(
    (thread) => !topOf.has(thread.id) && !thread.messages.every((m) => m.deleted),
  );

  const boxes = placed.map((thread) => ({
    id: thread.id,
    anchorTop: topOf.get(thread.id)!,
    height: heights[thread.id] ?? 120,
  }));
  const tops = layoutCards(boxes, GAP, activeId ?? undefined);
  const bottom = Math.max(0, ...boxes.map((box) => (tops[box.id] ?? 0) + box.height));
  const layoutKey = JSON.stringify(tops);

  useLayoutEffect(() => {
    const rail = own.current;
    if (narrow || !rail) return setLinks([]);
    const origin = rail.getBoundingClientRect();
    const shown = shownThreadIds(threads, activeId);
    const next: Link[] = [];
    for (const anchor of anchors) {
      const top = tops[anchor.threadId];
      const start = anchorLinkStart(anchor);
      if (top === undefined || !start || !shown.has(anchor.threadId)) continue;
      const from = { x: start.x - origin.left, y: start.y - origin.top };
      next.push({
        id: anchor.threadId,
        d: connectorPath(from, { x: 0, y: top + CONNECT_Y }, BEND),
      });
    }
    setLinks(next);
  }, [narrow, anchors, threads, activeId, layoutKey]);

  const card = (thread: Thread) => (
    <CommentCard
      thread={thread}
      active={thread.id === activeId}
      actions={actions}
      onActivate={() => onActivate(thread.id)}
      agent={agent}
    />
  );

  if (narrow) {
    return (
      <div
        ref={setRef}
        role="region"
        aria-label={t('document.commentsLabel')}
        {...stylex.props(styles.narrow)}
      >
        {[...placed]
          .sort((a, b) => topOf.get(a.id)! - topOf.get(b.id)!)
          .map((thread) => (
            <div key={thread.id}>{card(thread)}</div>
          ))}
        {orphaned.length > 0 ? (
          <div {...stylex.props(styles.section)}>{t('document.originalDeleted')}</div>
        ) : null}
        {orphaned.map((thread) => (
          <div key={thread.id}>{card(thread)}</div>
        ))}
      </div>
    );
  }

  return (
    <aside
      ref={setRef}
      aria-label={t('document.commentsLabel')}
      {...stylex.props(styles.wide)}
      style={{ minHeight: bottom }}
    >
      <svg {...stylex.props(styles.links)}>
        {links.map((link) => (
          <path
            key={link.id}
            d={link.d}
            fill="none"
            stroke={link.id === activeId ? '#c9a03a' : 'currentColor'}
            strokeOpacity={link.id === activeId ? 1 : 0.25}
            strokeDasharray={link.id === activeId ? undefined : '3 3'}
          />
        ))}
      </svg>
      {placed.map((thread) => (
        <div key={thread.id} {...stylex.props(styles.placed)} style={{ top: tops[thread.id] }}>
          <Measured id={thread.id} onHeight={onHeight}>
            {card(thread)}
          </Measured>
        </div>
      ))}
      {orphaned.length > 0 ? (
        <div style={{ position: 'absolute', top: bottom + GAP, left: 0, width: '100%' }}>
          <div {...stylex.props(styles.section)}>{t('document.originalDeleted')}</div>
          {orphaned.map((thread) => (
            <div key={thread.id} style={{ marginBottom: GAP }}>
              {card(thread)}
            </div>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
