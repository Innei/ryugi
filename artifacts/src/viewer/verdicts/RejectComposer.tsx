import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Composer } from '../document/Composer';

const styles = stylex.create({
  card: {
    position: 'absolute',
    zIndex: 9,
    width: 340,
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: cssVar.colorBgElevated,
    boxShadow: cssVar.boxShadowSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
    color: cssVar.colorText,
    cursor: 'default',
  },
  head: { display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, paddingInline: 14, fontSize: 11 },
  verdict: { color: '#e5484d', fontWeight: 600 },
  group: { fontFamily: cssVar.fontFamilyCode, color: cssVar.colorTextTertiary },
  required: { marginInlineStart: 'auto', color: cssVar.colorTextTertiary },
  hint: { paddingInline: 14, paddingBottom: 10, fontSize: 10, lineHeight: 1.6, color: cssVar.colorTextQuaternary },
});

interface Props {
  group: string;
  left: number;
  top: number;
  onSubmit: (text: string) => Promise<boolean>;
  onCancel: () => void;
}

export function RejectComposer({ group, left, top, onSubmit, onCancel }: Props) {
  return (
    <div data-chrome="reject" {...stylex.props(styles.card)} style={{ left, top }}>
      <div {...stylex.props(styles.head)}>
        <span {...stylex.props(styles.verdict)}>打回</span>
        <span {...stylex.props(styles.group)}>{group}</span>
        <span {...stylex.props(styles.required)}>原因必填</span>
      </div>
      <Composer autoFocus placeholder="写下打回原因…" onSubmit={onSubmit} onCancel={onCancel} />
      <div {...stylex.props(styles.hint)}>⌘↵ 打回 · Esc 取消 · 可以再按 C 在截图上标出具体位置</div>
    </div>
  );
}
