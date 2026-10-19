import { Popover } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  badge: {
    position: 'fixed',
    right: 12,
    bottom: 12,
    height: 28,
    paddingInline: 10,
    borderWidth: 0,
    borderRadius: 8,
    backgroundColor: cssVar.colorWarningBg,
    color: cssVar.colorWarningText,
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    fontWeight: 500,
    boxShadow: cssVar.boxShadowTertiary,
    cursor: 'pointer',
    zIndex: 10,
  },
  list: { margin: 0, paddingBlock: 4, paddingInlineStart: 18, maxWidth: 420, fontSize: 13, lineHeight: 1.6 },
});

export function WarningsBadge({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <Popover
      placement="topRight"
      content={
        <ul {...stylex.props(styles.list)}>
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      }
    >
      <button type="button" {...stylex.props(styles.badge)}>
        {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
      </button>
    </Popover>
  );
}
