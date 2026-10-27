import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';

export const ghostStyles = stylex.create({
  ghost: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    width: 44,
    height: 44,
    padding: 0,
    borderWidth: 0,
    borderRadius: 12,
    backgroundColor: { 'default': 'transparent', ':active': cssVar.colorFillTertiary },
    color: { 'default': cssVar.colorText, ':disabled': cssVar.colorTextQuaternary },
    cursor: { 'default': 'pointer', ':disabled': 'default' },
    transitionProperty: 'background-color, transform',
    transitionDuration: '120ms',
    transform: { 'default': null, ':active': 'scale(0.96)' },
  },
});
