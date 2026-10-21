import { FloatingSheet } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import type { PageSpec } from '../../shared/types';
import { useSheetSwipe } from '../hooks/useSheetSwipe';
import type { Question, Round } from '../lib/questions';
import { PageSwitcher } from './PhoneArtboardBar';

export const SHEET_PEEK = 78;
export const SHEET_OPEN = 0.66;

const styles = stylex.create({
  sheet: { pointerEvents: 'auto' },
  current: { display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0, fontFamily: cssVar.fontFamily, fontSize: 14 },
  id: { flexShrink: 0, fontFamily: cssVar.fontFamilyCode, fontSize: 13 },
  name: { minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 400 },
  steps: { display: 'flex', gap: 14 },
  step: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: { default: cssVar.colorText, ':disabled': cssVar.colorTextQuaternary },
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    whiteSpace: 'nowrap',
    cursor: { default: 'pointer', ':disabled': 'default' },
  },
  list: { paddingBottom: 24, fontFamily: cssVar.fontFamily },
  pages: { display: 'flex', justifyContent: 'flex-end', paddingInline: 16, paddingBlock: 4 },
  round: { paddingTop: 14, paddingBottom: 6, paddingInline: 16, color: cssVar.colorTextTertiary, fontSize: 12 },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    width: '100%',
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
}

export function QuestionSheet({ rounds, current, previous, next, pages, page, onPageChange, onPick, snap, onSnap }: Props) {
  const swipe = useSheetSwipe([SHEET_PEEK, SHEET_OPEN], snap, onSnap);
  return (
    <FloatingSheet
      open
      dismissible={false}
      variant="embedded"
      mode="overlay"
      className={stylex.props(styles.sheet).className}
      minHeight={SHEET_PEEK}
      maxHeight={SHEET_OPEN}
      snapPoints={[SHEET_PEEK, SHEET_OPEN]}
      activeSnapPoint={snap}
      onSnapPointChange={onSnap}
      title={
        <span data-question-bar {...swipe} {...stylex.props(styles.current)}>
          {current ? (
            <>
              <code {...stylex.props(styles.id)}>{current.id}</code>
              <span {...stylex.props(styles.name)}>{current.title}</span>
            </>
          ) : (
            <span {...stylex.props(styles.name)}>跳到</span>
          )}
        </span>
      }
      headerActions={
        <span {...stylex.props(styles.steps)}>
          <button type="button" disabled={!previous} onClick={() => previous && onPick(previous)} {...stylex.props(styles.step)}>
            ‹ 上一题
          </button>
          <button type="button" disabled={!next} onClick={() => next && onPick(next)} {...stylex.props(styles.step)}>
            下一题 ›
          </button>
        </span>
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
    </FloatingSheet>
  );
}
