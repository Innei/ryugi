import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';

export const EDIT_MENU_HEIGHT = 34;
export const EDIT_MENU_WIDTH = 150;

const styles = stylex.create({
  menu: {
    position: 'absolute',
    zIndex: 5,
    display: 'flex',
    height: EDIT_MENU_HEIGHT,
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: '#18181b',
  },
  button: {
    paddingBlock: 0,
    paddingInline: 13,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: '#fff',
    fontFamily: cssVar.fontFamily,
    fontSize: 13,
    cursor: 'pointer',
  },
  divided: { borderLeftWidth: 1, borderLeftStyle: 'solid', borderLeftColor: '#3f3f46' },
  primary: { fontWeight: 600 },
});

interface Props {
  left: number;
  top: number;
  canComment: boolean;
  canEdit: boolean;
  onComment: () => void;
  onCopy: () => void;
  onEdit: () => void;
}

export function PhoneEditMenu({ left, top, canComment, canEdit, onComment, onCopy, onEdit }: Props) {
  const items = [
    canComment ? { label: '评论', run: onComment, primary: true } : null,
    { label: '复制', run: onCopy, primary: false },
    canEdit ? { label: '改字', run: onEdit, primary: false } : null,
  ].filter((item) => item !== null);
  return (
    <div data-edit-menu {...stylex.props(styles.menu)} style={{ left, top }} onMouseDown={(event) => event.preventDefault()}>
      {items.map((item, index) => (
        <button key={item.label} type="button" onClick={item.run} {...stylex.props(styles.button, index > 0 && styles.divided, item.primary && styles.primary)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
