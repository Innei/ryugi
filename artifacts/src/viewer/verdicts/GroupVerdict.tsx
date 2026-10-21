import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Check, X } from 'lucide-react';
import type { GroupVerdict as Verdict } from '../../shared/verdicts';

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

const clock = (time: string | number) => new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

interface Props {
  verdict: Verdict;
  evidenceAt: number;
  canJudge: boolean;
  onPass: () => void;
  onReject: () => void;
}

export function GroupVerdict({ verdict, evidenceAt, canJudge, onPass, onReject }: Props) {
  if (verdict.state === 'pass') {
    return (
      <>
        <span {...stylex.props(styles.state, styles.pass)}><Check size={13} />已通过</span>
        {verdict.at && <span {...stylex.props(styles.note)}>{clock(verdict.at)}</span>}
      </>
    );
  }
  if (verdict.state === 'reject') {
    return (
      <>
        <span {...stylex.props(styles.state, styles.reject)}><X size={13} />已打回</span>
        <span {...stylex.props(styles.note)}>等 agent 修复 · {verdict.rejectThreads} 条线程</span>
      </>
    );
  }
  return (
    <>
      <span {...stylex.props(styles.state)}><span {...stylex.props(styles.ring)} />待验收</span>
      {verdict.evidenceUpdated && evidenceAt > 0 && <span {...stylex.props(styles.note)}>证据已更新 {clock(evidenceAt)}</span>}
      {canJudge && (
        <>
          <span {...stylex.props(styles.rule)} />
          <button type="button" onClick={onPass} {...stylex.props(styles.button, styles.passButton)}><Check size={13} />通过</button>
          <button type="button" onClick={onReject} {...stylex.props(styles.button, styles.rejectButton)}><X size={13} />打回</button>
        </>
      )}
    </>
  );
}
