import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
  message: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: cssVar.fontFamily,
    fontSize: 20,
    color: cssVar.colorTextSecondary,
    backgroundColor: cssVar.colorBgLayout,
  },
  html: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: 'block',
    width: '100%',
    height: '100%',
    borderWidth: 0,
    pointerEvents: 'none',
  },
  canvas: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: cssVar.colorBgLayout,
    backgroundImage: `radial-gradient(${cssVar.colorBorder} 1px, transparent 1px)`,
    backgroundSize: '12px 12px',
  },
});
