import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageSpec } from '../../shared/types';
import type { GroupVerdict } from '../../shared/verdicts';
import { brand } from '../tokens.stylex';
import { questionList, type Question, type Round } from '../lib/questions';
import { BottomSheet } from './BottomSheet';
import { ghostStyles } from './ghost';
import { PageSwitcher } from './PhoneArtboardBar';

export const SHEET_PEEK = 78;
export const SHEET_OPEN = 0.66;

const styles = stylex.create({
  head: { display: 'flex', alignItems: 'center', gap: 6, paddingInline: 6, paddingBottom: 12 },
  current: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, height: 44, paddingInline: 4, fontFamily: cssVar.fontFamily },
  line: { display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, fontSize: 14 },
  id: { flexShrink: 0, fontFamily: cssVar.fontFamilyCode, fontSize: 13 },
  currentId: { color: brand.accentStrong, fontWeight: 600 },
  name: { minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 400 },
  currentName: { fontWeight: 500 },
  position: { marginInlineStart: 'auto', flexShrink: 0, color: cssVar.colorTextTertiary, fontSize: 12, fontVariantNumeric: 'tabular-nums' },
  progress: { display: 'flex', gap: 3 },
  mark: { flex: 1, height: 3, borderRadius: 2, backgroundColor: cssVar.colorFillSecondary },
  markCurrent: { backgroundColor: brand.accent },
  markPass: { backgroundColor: cssVar.colorSuccess },
  markReject: { backgroundColor: cssVar.colorWarning },
  list: { paddingBottom: 24, fontFamily: cssVar.fontFamily },
  pages: { display: 'flex', justifyContent: 'flex-end', paddingInline: 16, paddingBlock: 4 },
  round: { paddingTop: 14, paddingBottom: 6, paddingInline: 16, color: cssVar.colorTextTertiary, fontSize: 12 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    minHeight: 48,
    paddingBlock: 11,
    paddingInline: 16,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: cssVar.colorBorderSecondary,
    backgroundColor: 'transparent',
    color: cssVar.colorText,
    fontFamily: cssVar.fontFamily,
    fontSize: 14,
    textAlign: 'left',
    cursor: 'pointer',
  },
  rowCurrent: { backgroundColor: cssVar.colorFillQuaternary },
  count: { marginInlineStart: 'auto', flexShrink: 0, color: cssVar.colorTextTertiary, fontSize: 12 },
});

interface Props {
  rounds: Round[];
  current: Question | null;
  previous: Question | null;
  next: Question | null;
  pages: PageSpec[];
  page: string | null;
  onPageChange: (id: string) => void;
  onPick: (question: Question) => void;
  snap: number;
  onSnap: (snap: number) => void;
  verdicts?: Record<string, GroupVerdict>;
}

const markOf = (question: Question, current: Question | null, verdicts: Record<string, GroupVerdict>) =>
  question.id === current?.id ? 'current' : verdicts[question.id]?.state === 'pass' ? 'pass' : verdicts[question.id]?.state === 'reject' ? 'reject' : 'open';

export function QuestionSheet({ rounds, current, previous, next, pages, page, onPageChange, onPick, snap, onSnap, verdicts = {} }: Props) {
  const list = questionList(rounds);
  const index = current ? list.findIndex((q) => q.id === current.id) : -1;
  return (
    <BottomSheet
      snaps={[SHEET_PEEK, SHEET_OPEN]}
      snap={snap}
      onSnap={onSnap}
      onScrim={() => onSnap(SHEET_PEEK)}
      header={
        <div {...stylex.props(styles.head)}>
          <button type="button" aria-label="上一题" disabled={!previous} onClick={() => previous && onPick(previous)} {...stylex.props(ghostStyles.ghost)}>
            <ChevronLeft size={20} />
          </button>
          <span data-question-bar {...stylex.props(styles.current)}>
            <span {...stylex.props(styles.line)}>
              {current ? (
                <>
                  <code {...stylex.props(styles.id, styles.currentId)}>{current.id}</code>
                  <span {...stylex.props(styles.name, styles.currentName)}>{current.title}</span>
                  <span {...stylex.props(styles.position)}>
                    {index + 1} / {list.length}
                  </span>
                </>
              ) : (
                <span {...stylex.props(styles.name)}>跳到</span>
              )}
            </span>
            <span data-progress {...stylex.props(styles.progress)}>
              {list.map((question) => {
                const mark = markOf(question, current, verdicts);
                return (
                  <span
                    key={question.id}
                    data-mark={mark}
                    {...stylex.props(styles.mark, mark === 'current' && styles.markCurrent, mark === 'pass' && styles.markPass, mark === 'reject' && styles.markReject)}
                  />
                );
              })}
            </span>
          </span>
          <button type="button" aria-label="下一题" disabled={!next} onClick={() => next && onPick(next)} {...stylex.props(ghostStyles.ghost)}>
            <ChevronRight size={20} />
          </button>
        </div>
      }
    >
      <div {...stylex.props(styles.list)}>
        {pages.length > 1 ? (
          <div {...stylex.props(styles.pages)}>
            <PageSwitcher pages={pages} page={page} onPageChange={onPageChange} />
          </div>
        ) : null}
        {rounds.map((round) => (
          <div key={round.id ?? '其他'}>
            <div data-round {...stylex.props(styles.round)}>{round.title}</div>
            {round.questions.map((question) => (
              <button
                key={question.id}
                type="button"
                data-question-row={question.id}
                onClick={() => onPick(question)}
                {...stylex.props(styles.row, question.id === current?.id && styles.rowCurrent)}
              >
                <code {...stylex.props(styles.id)}>{question.id}</code>
                <span {...stylex.props(styles.name)}>{question.title}</span>
                <span {...stylex.props(styles.count)}>{question.boards.length} 张</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
