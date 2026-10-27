import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import type { BoardAnchor, BoardThread } from '../../shared/board-comments';
import type { BoardSpec } from '../../shared/types';
import { ThreadView, type ThreadActions } from '../comments/ThreadView';
import { Composer } from '../document/Composer';
import { anchorLabel, pinPoint, staleText } from '../lib/board-anchor';
import type { View } from '../lib/view';
import { brand } from '../tokens.stylex';
import { useTranslation } from '../i18n';

const PIN = 28;
const POPOVER = 300;
const GAP = 14;

const styles = stylex.create({
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
    borderColor: '#fff',
    backgroundColor: '#4285ee',
    color: '#fff',
    fontFamily: cssVar.fontFamily,
    fontSize: 11,
    fontWeight: 600,
    transform: 'translateY(-100%)',
    pointerEvents: 'auto',
    cursor: 'pointer',
  },
  agent: { backgroundColor: brand.accentStrong },
  reject: { backgroundColor: '#e5484d' },
  resolved: { backgroundColor: '#3a3a3a', color: '#aaa' },
  stale: {
    backgroundColor: cssVar.colorBgLayout,
    borderStyle: 'dashed',
    borderColor: '#e5a54b',
    color: '#e5a54b',
  },
  open: { outlineWidth: 3, outlineStyle: 'solid', outlineColor: 'rgb(66 133 238 / .35)' },
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
  view: View;
  page: string | null;
  boards: Record<string, BoardSpec>;
  width: number;
  threads: BoardThread[];
  stale: Set<string>;
  numbers: Map<string, number>;
  showResolved: boolean;
  draft: BoardAnchor | null;
  openId: string | null;
  actions?: ThreadActions;
  agent?: string;
  onOpen: (id: string | null) => void;
  onSubmit: (text: string) => Promise<boolean>;
  onCancelDraft: () => void;
}

const screenOf = (view: View, point: { x: number; y: number }) => ({
  x: view.x + point.x * view.k,
  y: view.y + point.y * view.k,
});

function popoverLeft(x: number, width: number) {
  const right = x + PIN + GAP;
  return right + POPOVER > width - 12 ? Math.max(12, x - GAP - POPOVER) : right;
}

export function CommentLayer({
  view,
  page,
  boards,
  width,
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
      {visible.map((thread) => {
        const point = pinPoint(thread.anchor, boards);
        if (!point) return null;
        const at = screenOf(view, point);
        const author = thread.messages[0]?.author;
        return (
          <button
            key={thread.id}
            type="button"
            aria-label={t('comments.pin', { number: numbers.get(thread.id) ?? '' })}
            data-verdict={thread.anchor.verdict}
            onClick={() => onOpen(thread.id === openId ? null : thread.id)}
            {...stylex.props(
              styles.pin,
              author === 'agent' && styles.agent,
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
        <div
          {...stylex.props(styles.popover)}
          style={
            openPoint
              ? {
                  left: popoverLeft(screenOf(view, openPoint).x, width),
                  top: screenOf(view, openPoint).y - PIN,
                }
              : { right: 12, top: 64 }
          }
        >
          <ThreadView
            thread={open}
            label={`#${numbers.get(open.id)} ${anchorLabel(open.anchor)}${stale.has(open.id) ? ` · ${staleText(open.anchor)}` : ''}`}
            actions={actions}
            agent={agent}
            onClose={() => onOpen(null)}
          />
        </div>
      ) : null}
      {draft && draftPoint ? (
        <>
          <span
            {...stylex.props(styles.pin)}
            style={{ left: screenOf(view, draftPoint).x, top: screenOf(view, draftPoint).y }}
          />
          <div
            {...stylex.props(styles.popover)}
            style={{
              left: popoverLeft(screenOf(view, draftPoint).x, width),
              top: screenOf(view, draftPoint).y - PIN,
            }}
          >
            <div {...stylex.props(styles.draftHead)}>
              {t('comments.anchoredTo', { label: anchorLabel(draft) })}
            </div>
            <Composer
              autoFocus
              placeholder={t('comments.addPlaceholder')}
              onSubmit={onSubmit}
              onCancel={onCancelDraft}
            />
            <div {...stylex.props(styles.hint)}>{t('comments.sendHint')}</div>
          </div>
        </>
      ) : null}
    </div>
  );
}
