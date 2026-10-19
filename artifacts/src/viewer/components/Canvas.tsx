import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { DEFAULT_TITLE_SIZE, STICKY_DEFAULT_W, STICKY_FONT_SIZE, STICKY_LINE_H, STICKY_PAD } from '../../shared/geometry';
import type { BoardSpec, NoteSpec } from '../../shared/types';
import type { View } from '../lib/view';

const styles = stylex.create({
  world: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0' },
  board: {
    position: 'absolute',
    display: 'block',
    borderWidth: 0,
    backgroundColor: '#fff',
    pointerEvents: 'none',
    outlineWidth: 1,
    outlineStyle: 'solid',
    outlineColor: cssVar.colorBorderSecondary,
  },
  title: {
    position: 'absolute',
    margin: 0,
    fontWeight: 700,
    lineHeight: 1.15,
    letterSpacing: '-0.01em',
    color: cssVar.colorText,
  },
  sticky: {
    position: 'absolute',
    borderRadius: 4,
    backgroundColor: '#fff6db',
    color: '#3d2e00',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.03)',
  },
});

interface CanvasProps {
  view: View;
  boards: [string, BoardSpec][];
  notes: [string, NoteSpec][];
  boardBase: string;
  versions: Record<string, number>;
}

export function Canvas({ view, boards, notes, boardBase, versions }: CanvasProps) {
  return (
    <div {...stylex.props(styles.world)} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
      {boards.map(([id, board]) => (
        <iframe
          key={id}
          title={board.title ?? id}
          src={`${boardBase}${board.file}?v=${versions[board.file] ?? 0}`}
          sandbox="allow-scripts"
          loading="lazy"
          {...stylex.props(styles.board)}
          style={{ left: board.x, top: board.y, width: board.w, height: board.h }}
        />
      ))}
      {notes.map(([id, note]) =>
        note.kind === 'title' ? (
          <h2
            key={id}
            {...stylex.props(styles.title)}
            style={{
              left: note.x,
              top: note.y,
              width: note.w,
              whiteSpace: note.w === undefined ? 'nowrap' : 'normal',
              fontSize: note.size ?? DEFAULT_TITLE_SIZE,
            }}
          >
            {note.text}
          </h2>
        ) : (
          <div
            key={id}
            {...stylex.props(styles.sticky)}
            style={{
              left: note.x,
              top: note.y,
              width: note.w ?? STICKY_DEFAULT_W,
              padding: STICKY_PAD,
              fontSize: STICKY_FONT_SIZE,
              lineHeight: `${STICKY_LINE_H}px`,
            }}
          >
            {note.text}
          </div>
        ),
      )}
    </div>
  );
}
