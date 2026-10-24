import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Check, X } from 'lucide-react';
import type { GroupVerdict as Verdict } from '../../shared/verdicts';
import { useTranslation } from '../i18n';

const GREEN = '#2ea043';
const RED = '#e5484d';

const styles = stylex.create({
  state: { display: 'flex', alignItems: 'center', gap: 6, marginInlineStart: 10, fontWeight: 500, color: cssVar.colorTextTertiary },
  pass: { color: GREEN },
  reject: { color: RED },
  ring: { width: 8, height: 8, boxSizing: 'border-box', borderRadius: '50%', borderWidth: 1.5, borderStyle: 'solid', borderColor: 'currentColor' },
  note: { fontWeight: 400, fontSize: 12, color: cssVar.colorTextTertiary },
  rule: { width: 1, height: 12, marginInline: 4, backgroundColor: cssVar.colorBorder },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: cssVar.colorTextSecondary,
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 500,
    cursor: 'pointer',
  },
  passButton: { color: { default: cssVar.colorTextSecondary, ':hover': GREEN } },
  rejectButton: { color: { default: cssVar.colorTextSecondary, ':hover': RED } },
});

const clock = (time: string | number, locale: string) => new Date(time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

interface Props {
  verdict: Verdict;
  evidenceAt: number;
  canJudge: boolean;
  onPass: () => void;
  onReject: () => void;
  onUndo: () => void;
}

export function GroupVerdict({ verdict, evidenceAt, canJudge, onPass, onReject, onUndo }: Props) {
  const { t, i18n } = useTranslation();
  if (verdict.state === 'pass') {
    return (
      <>
        <span {...stylex.props(styles.state, styles.pass)}><Check size={13} />{t('verdict.passed')}</span>
        {verdict.at && <span {...stylex.props(styles.note)}>{clock(verdict.at, i18n.language)}</span>}
        {canJudge && <button type="button" onClick={onUndo} {...stylex.props(styles.button, styles.note)}>{t('verdict.undo')}</button>}
      </>
    );
  }
  if (verdict.state === 'reject') {
    return (
      <>
        <span {...stylex.props(styles.state, styles.reject)}><X size={13} />{t('verdict.rejected')}</span>
        <span {...stylex.props(styles.note)}>{t('verdict.waitingFix', { count: verdict.rejectThreads })}</span>
      </>
    );
  }
  return (
    <>
      <span {...stylex.props(styles.state)}><span {...stylex.props(styles.ring)} />{t('verdict.pending')}</span>
      {verdict.evidenceUpdated && evidenceAt > 0 && <span {...stylex.props(styles.note)}>{t('verdict.evidenceUpdatedAt', { time: clock(evidenceAt, i18n.language) })}</span>}
      {canJudge && (
        <>
          <span {...stylex.props(styles.rule)} />
          <button type="button" onClick={onPass} {...stylex.props(styles.button, styles.passButton)}><Check size={13} />{t('verdict.pass')}</button>
          <button type="button" onClick={onReject} {...stylex.props(styles.button, styles.rejectButton)}><X size={13} />{t('verdict.reject')}</button>
        </>
      )}
    </>
  );
}
