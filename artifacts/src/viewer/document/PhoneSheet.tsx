import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef } from 'react';

import { type Thread, waitingOn } from '../../shared/comments';
import { BottomSheet } from '../components/BottomSheet';
import { t } from '../i18n';
import { anchorLabel } from './anchor';
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
  title: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    minHeight: 36,
    paddingInline: 20,
    paddingBottom: 8,
    fontFamily: cssVar.fontFamily,
    fontSize: 15,
    fontWeight: 600,
  },
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
  cancel: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: cssVar.colorTextTertiary,
    fontSize: 13,
    cursor: 'pointer',
  },
  draftBox: {
    marginTop: 8,
    marginInline: -14,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorder,
  },
  empty: {
    paddingBlock: 24,
    color: cssVar.colorTextTertiary,
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    textAlign: 'center',
  },
});

interface Props {
  actions?: ThreadActions;
  activeId: string | null;
  agent?: string;
  draft: SelectionTarget | null;
  offline: boolean;
  onCancelDraft: () => void;
  onCreate: (target: SelectionTarget, text: string) => Promise<boolean>;
  onSnap: (snap: number) => void;
  snap: number;
  threads: Thread[];
}

export function PhoneSheet({
  threads,
  agent = 'Agent',
  actions,
  offline,
  draft,
  onCreate,
  onCancelDraft,
  activeId,
  snap,
  onSnap,
}: Props) {
  const body = useRef<HTMLDivElement>(null);
  const shown = threads.filter((thread) => !thread.messages.every((message) => message.deleted));
  const waiting = shown.filter((thread) => waitingOn(thread) === 'agent').length;
  const note = offline
    ? t('document.offlineNoComments')
    : waiting > 0
      ? t('document.waitingCount', { count: waiting, agent })
      : null;

  useEffect(() => {
    const thread = activeId
      ? body.current?.querySelector(`[data-thread="${CSS.escape(activeId)}"]`)
      : null;
    const scroller = thread?.closest('[data-sheet-body]');
    if (!thread || !scroller) return;
    scroller.scrollTo({
      top:
        scroller.scrollTop +
        thread.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        8,
      behavior: 'smooth',
    });
    void play(
      thread,
      [{ backgroundColor: 'rgba(232, 194, 74, 0.24)' }, { backgroundColor: 'transparent' }],
      { duration: 600, delay: 250, easing: EASE },
    );
  }, [activeId]);

  return (
    <BottomSheet
      snap={snap}
      snaps={[SHEET_PEEK, SHEET_HALF, SHEET_FULL]}
      header={
        <span {...stylex.props(styles.title)}>
          {t('document.sheetComments', { count: shown.length })}
          {note ? <span {...stylex.props(styles.note)}>· {note}</span> : null}
        </span>
      }
      onScrim={() => onSnap(SHEET_HALF)}
      onSnap={onSnap}
    >
      <div ref={body} {...stylex.props(styles.body)}>
        {draft && actions ? (
          <div {...stylex.props(styles.draft)}>
            <div {...stylex.props(styles.draftHead)}>
              <span {...stylex.props(styles.draftQuote)}>{anchorLabel(draft)}</span>
              <button type="button" onClick={onCancelDraft} {...stylex.props(styles.cancel)}>
                {t('common.cancel')}
              </button>
            </div>
            <div {...stylex.props(styles.draftBox)}>
              <Composer
                autoFocus
                placeholder={t('document.agentPlaceholder')}
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
        {shown.length === 0 && !draft ? (
          <div {...stylex.props(styles.empty)}>{t('document.noComments')}</div>
        ) : null}
        {shown.map((thread) => (
          <PhoneThread
            actions={actions}
            active={thread.id === activeId}
            agent={agent}
            key={thread.id}
            offline={offline}
            thread={thread}
          />
        ))}
      </div>
    </BottomSheet>
  );
}
