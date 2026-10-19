import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { DEFAULT_TITLE_SIZE, STICKY_DEFAULT_W, STICKY_FONT_SIZE, STICKY_LINE_H, STICKY_PAD } from '../../shared/geometry';
import type { BoardSpec, NoteSpec } from '../../shared/types';
import { boardReady, boardSrc, canPlay } from '../lib/play';
import { titleScale, type View } from '../lib/view';

const PLAY_ACCENT = '#8b7cf8';

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
  playing: { pointerEvents: 'auto', outlineWidth: 2, outlineColor: PLAY_ACCENT },
  skeleton: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: cssVar.colorFillTertiary,
    outlineWidth: 1,
    outlineStyle: 'solid',
    outlineColor: cssVar.colorBorderSecondary,
    pointerEvents: 'none',
  },
  skeletonText: {
    color: cssVar.colorTextSecondary,
    fontFamily: cssVar.fontFamily,
    fontSize: 12,
  },
  title: {
    position: 'absolute',
    margin: 0,
    fontWeight: 700,
    lineHeight: 1.15,
    letterSpacing: '-0.01em',
    color: cssVar.colorText,
    transformOrigin: 'left bottom',
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
  contentBase: string;
  versions: Record<string, number>;
  pending: ReadonlySet<string>;
  playing: ReadonlySet<string>;
  replays: Record<string, number>;
}

export function Canvas({ view, boards, notes, contentBase, versions, pending, playing, replays }: CanvasProps) {
  return (
    <div {...stylex.props(styles.world)} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
      {boards.map(([id, board]) => {
        const ready = boardReady(versions, board.file) && !pending.has(id);
        const position = { left: board.x, top: board.y, width: board.w, height: board.h };
        if (!ready) {
          return (
            <div key={id} {...stylex.props(styles.skeleton)} style={position}>
              <span {...stylex.props(styles.skeletonText)}>Drawing…</span>
            </div>
          );
        }
        return (
          <iframe
            key={id}
            title={board.title ?? id}
            src={boardSrc(contentBase, board.file, versions[board.file] ?? 0, replays[id] ?? 0)}
            sandbox="allow-scripts"
            loading="lazy"
            {...stylex.props(styles.board, canPlay(board, versions) && playing.has(id) && styles.playing)}
            style={position}
          />
        );
      })}
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
              transform: `scale(${titleScale(note.size ?? DEFAULT_TITLE_SIZE, view.k)})`,
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
