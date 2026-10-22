import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef } from 'react';
import { waitingOn, type Thread } from '../../shared/comments';
import { BottomSheet } from '../components/BottomSheet';
import type { ThreadActions } from './CommentCard';
import { Composer } from './Composer';
import { EASE, play } from './motion';
import { PhoneThread } from './PhoneThread';
import type { SelectionTarget } from './useSelectionComment';

export const SHEET_PEEK = 78;
export const SHEET_HALF = 0.5;
export const SHEET_FULL = 1;

export const raiseSheet = (snap: number) => (snap === SHEET_PEEK ? SHEET_HALF : snap);

const styles = stylex.create({
  body: { paddingInline: 20, paddingBottom: 24 },
  title: { display: 'flex', alignItems: 'baseline', gap: 6, minHeight: 36, paddingInline: 20, paddingBottom: 8, fontFamily: cssVar.fontFamily, fontSize: 15, fontWeight: 600 },
  note: { color: cssVar.colorTextTertiary, fontSize: 12, fontWeight: 400 },
  draft: { paddingBlock: 12, fontFamily: cssVar.fontFamily },
  draftHead: { display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13 },
  draftQuote: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftStyle: 'solid',
    borderLeftColor: '#e8c24a',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    color: cssVar.colorTextSecondary,
  },
  cancel: { padding: 0, borderWidth: 0, backgroundColor: 'transparent', color: cssVar.colorTextTertiary, fontSize: 13, cursor: 'pointer' },
  draftBox: { marginTop: 8, marginInline: -14, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: cssVar.colorBorder },
  empty: { paddingBlock: 24, color: cssVar.colorTextTertiary, fontFamily: cssVar.fontFamily, fontSize: 13, textAlign: 'center' },
});

interface Props {
  threads: Thread[];
  agent?: string;
  actions?: ThreadActions;
  offline: boolean;
  draft: SelectionTarget | null;
  onCreate: (target: SelectionTarget, text: string) => Promise<boolean>;
  onCancelDraft: () => void;
  activeId: string | null;
  snap: number;
  onSnap: (snap: number) => void;
}

export function PhoneSheet({ threads, agent = 'Agent', actions, offline, draft, onCreate, onCancelDraft, activeId, snap, onSnap }: Props) {
  const body = useRef<HTMLDivElement>(null);
  const shown = threads.filter((thread) => !thread.messages.every((message) => message.deleted));
  const waiting = shown.filter((thread) => waitingOn(thread) === 'agent').length;
  const note = offline ? '电脑离线，暂时不能评论' : waiting > 0 ? `${waiting} 条等 ${agent} 回复` : null;

  useEffect(() => {
    const thread = activeId ? body.current?.querySelector(`[data-thread="${CSS.escape(activeId)}"]`) : null;
    if (!thread) return;
    thread.scrollIntoView({ block: 'start', behavior: 'smooth' });
    void play(thread, [{ backgroundColor: 'rgba(232, 194, 74, 0.24)' }, { backgroundColor: 'transparent' }], { duration: 600, delay: 250, easing: EASE });
  }, [activeId]);

  return (
    <BottomSheet
      snaps={[SHEET_PEEK, SHEET_HALF, SHEET_FULL]}
      snap={snap}
      onSnap={onSnap}
      onScrim={() => onSnap(SHEET_HALF)}
      header={
        <span {...stylex.props(styles.title)}>
          评论 {shown.length}
          {note ? <span {...stylex.props(styles.note)}>· {note}</span> : null}
        </span>
      }
    >
      <div ref={body} {...stylex.props(styles.body)}>
        {draft && actions ? (
          <div {...stylex.props(styles.draft)}>
            <div {...stylex.props(styles.draftHead)}>
              <span {...stylex.props(styles.draftQuote)}>{draft.quote}</span>
              <button type="button" onClick={onCancelDraft} {...stylex.props(styles.cancel)}>
                取消
              </button>
            </div>
            <div {...stylex.props(styles.draftBox)}>
              <Composer
                autoFocus
                placeholder="写给 agent 的评论…"
                onSubmit={(text) =>
                  onCreate(draft, text).then((ok) => {
                    if (ok) onCancelDraft();
                    return ok;
                  })
                }
              />
            </div>
          </div>
        ) : null}
        {shown.length === 0 && !draft ? <div {...stylex.props(styles.empty)}>还没有评论。选中文字就能评论。</div> : null}
        {shown.map((thread) => (
          <PhoneThread key={thread.id} thread={thread} agent={agent} actions={actions} active={thread.id === activeId} offline={offline} />
        ))}
      </div>
    </BottomSheet>
  );
}
