import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { type ReactNode, type Ref, useLayoutEffect, useRef, useState } from 'react';

import type { BoardAnchor, BoardThread } from '../../shared/board-comments';
import type { BoardSpec } from '../../shared/types';
import { type ThreadActions, ThreadView } from '../comments/ThreadView';
import { Composer } from '../document/Composer';
import { useTranslation } from '../i18n';
import { anchorLabel, pinPoint, staleText } from '../lib/board-anchor';
import type { View } from '../lib/view';
import { color } from '../tokens.stylex';

const PIN = 28;
const POPOVER = 300;
const GAP = 14;

const styles = stylex.create({
  overlay: { position: 'absolute', inset: 0 },
  layer: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 8 },
  pin: {
    position: 'absolute',
    width: PIN,
    height: PIN,
    padding: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: '50% 50% 50% 0',
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: color.white,
    backgroundColor: color.selection,
    color: color.white,
    fontFamily: cssVar.fontFamily,
    fontSize: 11,
    fontWeight: 600,
    transform: 'translateY(-100%)',
    pointerEvents: 'auto',
    cursor: 'pointer',
  },
  reject: { backgroundColor: color.danger },
  resolved: { backgroundColor: color.resolved, color: color.mediaMuted },
  stale: {
    backgroundColor: cssVar.colorBgLayout,
    borderStyle: 'dashed',
    borderColor: color.warningText,
    color: color.warningText,
  },
  open: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: color.selectionLine },
  popover: {
    position: 'absolute',
    width: POPOVER,
    maxHeight: 420,
    overflowY: 'auto',
    borderRadius: 14,
    backgroundColor: cssVar.colorBgElevated,
    boxShadow: cssVar.boxShadowSecondary,
    pointerEvents: 'auto',
    cursor: 'default',
    userSelect: 'text',
  },
  draftHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    paddingInline: 14,
    fontSize: 11,
    color: cssVar.colorTextTertiary,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  hint: {
    paddingInline: 14,
    paddingBottom: 10,
    fontSize: 10,
    color: cssVar.colorTextQuaternary,
    fontFamily: cssVar.fontFamily,
  },
});

interface Props {
  actions?: ThreadActions;
  agent?: string;
  boards: Record<string, BoardSpec>;
  draft: BoardAnchor | null;
  height: number;
  numbers: Map<string, number>;
  onCancelDraft: () => void;
  onOpen: (id: string | null) => void;
  onSubmit: (text: string) => Promise<boolean>;
  openId: string | null;
  overlayRef?: Ref<HTMLDivElement>;
  page: string | null;
  showResolved: boolean;
  stale: Set<string>;
  threads: BoardThread[];
  view: View;
  width: number;
}

const screenOf = (view: View, point: { x: number; y: number }) => ({
  x: view.x + point.x * view.k,
  y: view.y + point.y * view.k,
});

function popoverLeft(x: number, width: number, popupWidth: number) {
  const right = x + PIN + GAP;
  return Math.max(
    12,
    Math.min(
      right + popupWidth > width - 12 ? x - GAP - popupWidth : right,
      width - popupWidth - 12,
    ),
  );
}

function CommentPopover({
  point,
  width,
  height,
  children,
}: {
  point: { x: number; y: number } | null;
  width: number;
  height: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(420);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setMeasured(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const topInset = Math.min(64, Math.max(0, height - 12));
  const maxHeight = Math.max(0, Math.min(420, height - topInset - 12));
  const popupWidth = Math.max(0, Math.min(POPOVER, width - 24));
  return (
    <div
      ref={ref}
      {...stylex.props(styles.popover)}
      style={{
        left: point
          ? popoverLeft(point.x, width, popupWidth)
          : Math.max(12, width - popupWidth - 12),
        top: Math.max(
          topInset,
          Math.min(point ? point.y - PIN : topInset, height - Math.min(measured, maxHeight) - 12),
        ),
        width: popupWidth,
        maxHeight,
      }}
    >
      {children}
    </div>
  );
}

export function CommentLayer({
  view,
  overlayRef,
  page,
  boards,
  width,
  height,
  threads,
  stale,
  numbers,
  showResolved,
  draft,
  openId,
  actions,
  agent,
  onOpen,
  onSubmit,
  onCancelDraft,
}: Props) {
  const { t } = useTranslation();
  const visible = threads.filter(
    (thread) =>
      thread.anchor.page === page &&
      thread.anchor.verdict !== 'pass' &&
      thread.messages.some((m) => !m.deleted) &&
      (showResolved || thread.status === 'open' || thread.id === openId),
  );
  const open = threads.find((thread) => thread.id === openId);
  const openPoint = open ? pinPoint(open.anchor, boards) : null;
  const draftPoint = draft ? pinPoint(draft, boards) : null;
  return (
    <div data-chrome="comments" {...stylex.props(styles.layer)}>
      <div ref={overlayRef} {...stylex.props(styles.overlay)}>
        {visible.map((thread) => {
          const point = pinPoint(thread.anchor, boards);
          if (!point) return null;
          const at = screenOf(view, point);
          return (
            <button
              aria-label={t('comments.pin', { number: numbers.get(thread.id) ?? '' })}
              data-verdict={thread.anchor.verdict}
              key={thread.id}
              type="button"
              onClick={() => onOpen(thread.id === openId ? null : thread.id)}
              {...stylex.props(
                styles.pin,
                thread.anchor.verdict === 'reject' && styles.reject,
                thread.status === 'resolved' && styles.resolved,
                stale.has(thread.id) && styles.stale,
                thread.id === openId && styles.open,
              )}
              style={{ left: at.x, top: at.y }}
            >
              {numbers.get(thread.id)}
            </button>
          );
        })}
        {open ? (
          <CommentPopover
            height={height}
            point={openPoint ? screenOf(view, openPoint) : null}
            width={width}
          >
            <ThreadView
              actions={actions}
              agent={agent}
              label={`#${numbers.get(open.id)} ${anchorLabel(open.anchor)}${stale.has(open.id) ? ` · ${staleText(open.anchor)}` : ''}`}
              thread={open}
              onClose={() => onOpen(null)}
            />
          </CommentPopover>
        ) : null}
        {draft && draftPoint ? (
          <>
            <span
              {...stylex.props(styles.pin)}
              style={{ left: screenOf(view, draftPoint).x, top: screenOf(view, draftPoint).y }}
            />
            <CommentPopover height={height} point={screenOf(view, draftPoint)} width={width}>
              <div {...stylex.props(styles.draftHead)}>
                {t('comments.anchoredTo', { label: anchorLabel(draft) })}
              </div>
              <Composer
                autoFocus
                placeholder={t('comments.addPlaceholder')}
                onCancel={onCancelDraft}
                onSubmit={onSubmit}
              />
              <div {...stylex.props(styles.hint)}>{t('comments.sendHint')}</div>
            </CommentPopover>
          </>
        ) : null}
      </div>
    </div>
  );
}
