import * as stylex from '@stylexjs/stylex';

import type { RoundSummary } from '../hooks/useChoices';
import { useTranslation } from '../i18n';
import { brand, color } from '../tokens.stylex';

const styles = stylex.create({
  bar: {
    position: 'absolute',
    left: '50%',
    bottom: 20,
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    maxWidth: 'calc(100% - 32px)',
    height: 44,
    paddingInlineStart: 16,
    paddingInlineEnd: 6,
    borderRadius: 12,
    backgroundColor: color.overlay,
    color: color.overlayText,
    boxShadow: `0 8px 24px ${color.overlayShadow}`,
    fontSize: 13,
    whiteSpace: 'nowrap',
    zIndex: 10,
  },
  title: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 },
  rule: { width: 1, height: 16, flexShrink: 0, backgroundColor: color.overlayActive },
  dim: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.65 },
  dot: {
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: '50%',
    backgroundColor: color.agent,
  },
  primary: {
    height: 32,
    flexShrink: 0,
    paddingInline: 14,
    borderWidth: 0,
    borderRadius: 8,
    backgroundColor: { 'default': brand.accent, ':hover': brand.accentStrong },
    color: color.onStrong,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  quiet: {
    height: 32,
    flexShrink: 0,
    paddingInline: 10,
    borderWidth: 0,
    borderRadius: 8,
    backgroundColor: { 'default': 'transparent', ':hover': color.overlayActive },
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
  },
});

const clock = (time: string, locale: string) =>
  new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

interface Props {
  agent?: string;
  bottom?: number;
  canAct: boolean;
  listening: boolean;
  onSubmit: () => void;
  onWithdraw: () => void;
  summary: RoundSummary;
}

export function SubmitBar({
  summary,
  listening,
  agent,
  bottom,
  canAct,
  onSubmit,
  onWithdraw,
}: Props) {
  const { t, i18n } = useTranslation();
  const place = bottom === undefined ? undefined : { bottom, pointerEvents: 'auto' as const };
  const list = (groups: string[]) => groups.join(', ');
  if (summary.state === 'submitted')
    return (
      <div data-submit-bar data-chrome="submit-bar" {...stylex.props(styles.bar)} style={place}>
        {listening && <span {...stylex.props(styles.dot)} />}
        <span>
          {summary.submittedAt
            ? t('choices.submittedAt', { time: clock(summary.submittedAt, i18n.language) })
            : t('choices.submitted')}
        </span>
        <span {...stylex.props(styles.dim)}>
          {listening
            ? t('choices.drawing', { agent: agent ?? t('choices.agent') })
            : t('choices.sayDone')}
        </span>
        {canAct && (
          <button type="button" onClick={onWithdraw} {...stylex.props(styles.quiet)}>
            {t('choices.withdraw')}
          </button>
        )}
      </div>
    );
  const notes = [
    summary.comments ? t('choices.comments', { count: summary.comments }) : '',
    summary.byRecommendation.length
      ? t('choices.byRecommendation', { groups: list(summary.byRecommendation) })
      : '',
    summary.unanswered.length ? t('choices.unanswered', { groups: list(summary.unanswered) }) : '',
  ].filter(Boolean);
  return (
    <div data-submit-bar data-chrome="submit-bar" {...stylex.props(styles.bar)} style={place}>
      {summary.round.title && <span {...stylex.props(styles.title)}>{summary.round.title}</span>}
      {summary.round.title && <span {...stylex.props(styles.rule)} />}
      <span>{t('choices.chosen', { count: summary.chosen, total: summary.total })}</span>
      {notes.length > 0 && <span {...stylex.props(styles.dim)}>{notes.join(' · ')}</span>}
      {canAct && (
        <button type="button" onClick={onSubmit} {...stylex.props(styles.primary)}>
          {t('choices.submit')}
        </button>
      )}
    </div>
  );
}
