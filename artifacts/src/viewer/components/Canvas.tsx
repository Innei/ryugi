import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { DEFAULT_TITLE_SIZE, STICKY_DEFAULT_W, STICKY_FONT_SIZE, STICKY_LINE_H, STICKY_PAD } from '../../shared/geometry';
import { isMediaBoard, type BoardSpec, type NoteSpec } from '../../shared/types';
import type { Inspector } from '../hooks/useInspector';
import { useVisibleBoards } from '../hooks/useVisibleBoards';
import { boardReady, boardSrc, canPlay } from '../lib/play';
import { titleScale, type View } from '../lib/view';
import { MediaBoard } from './MediaBoard';
import { WritingCursor } from './WritingCursor';

const PLAY_ACCENT = '#8b7cf8';

const styles = stylex.create({
  world: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0' },
  slot: { position: 'absolute' },
  board: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
    borderWidth: 0,
    backgroundColor: '#fff',
    pointerEvents: 'none',
    outlineWidth: 1,
    outlineStyle: 'solid',
    outlineColor: cssVar.colorBorderSecondary,
  },
  playing: { pointerEvents: 'auto', outlineWidth: 2, outlineColor: PLAY_ACCENT },
  inspecting: { pointerEvents: 'auto' },
  skeleton: {
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
  drawing: {
    outlineStyle: 'solid',
    outlineColor: PLAY_ACCENT,
    backgroundImage: 'linear-gradient(110deg, transparent, rgba(139,124,248,0.1), transparent)',
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
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.03)',
  },
});

interface CanvasProps {
  writing?: string;
  agent?: string;
  retained?: ReadonlySet<string>;
  view: View;
  boards: [string, BoardSpec][];
  notes: [string, NoteSpec][];
  contentBase: string;
  versions: Record<string, number>;
  pending: ReadonlySet<string>;
  playing: ReadonlySet<string>;
  replays: Record<string, number>;
  inspecting: boolean;
  frameRef: Inspector['refFor'];
  frameLoaded: Inspector['loaded'];
  onExpand?: (id: string) => void;
}

function stickyColors(color?: string) {
  if (!color) return { backgroundColor: '#fff6db', color: '#3d2e00' };
  const hex = color.length === 4 ? color.slice(1).split('').map((c) => c + c).join('') : color.slice(1);
  const [r, g, b] = [0, 2, 4].map((at) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return { backgroundColor: color, color: luminance > 0.179 ? '#000' : '#fff' };
}

export function Canvas({ view, boards, notes, contentBase, versions, pending, playing, replays, inspecting, frameRef, frameLoaded, writing, agent, retained, onExpand }: CanvasProps) {
  const { ref, visible } = useVisibleBoards(boards.map(([id]) => id));
  const active = boards.find(([id]) => id === writing)?.[1];
  return (
    <div ref={ref} {...stylex.props(styles.world)} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
      {boards.map(([id, board]) => {
        const ready = boardReady(versions, board.file) && !pending.has(id);
        const mounted = ready && (visible.has(id) || playing.has(id) || retained?.has(id));
        const drawing = id === writing;
        const position = { left: board.x, top: board.y, width: board.w, height: board.h };
        return (
          <div key={id} data-board={id} aria-busy={drawing || undefined}
            {...stylex.props(styles.slot, !mounted && styles.skeleton, drawing && styles.drawing)}
            style={{ ...position, ...(drawing ? { outlineWidth: 2 / view.k } : {}) }}>
            {mounted && isMediaBoard(board) ? (
              <MediaBoard id={id} board={board} src={boardSrc(contentBase, board.file, versions[board.file] ?? 0, 0)} zoom={view.k} onExpand={onExpand && (() => onExpand(id))} />
            ) : mounted ? (
              <iframe
                ref={frameRef(id)}
                onLoad={() => frameLoaded(id)}
                title={board.title ?? id}
                src={boardSrc(contentBase, board.file, versions[board.file] ?? 0, replays[id] ?? 0)}
                sandbox="allow-scripts"
                {...stylex.props(styles.board, inspecting && styles.inspecting, canPlay(board, versions) && playing.has(id) && styles.playing)}
              />
            ) : <span {...stylex.props(styles.skeletonText)}>{drawing ? 'Drawing…' : ready ? 'Loading preview…' : 'Waiting…'}</span>}
          </div>
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
              ...stickyColors(note.color),
            }}
          >
            {note.text}
          </div>
        ),
      )}
      {active && (
        <WritingCursor x={active.x + Math.min(64, active.w * 0.15)} y={active.y + Math.min(80, active.h * 0.2)}
          zoom={view.k} agent={agent ?? 'Agent'} title={active.title ?? writing!} />
      )}
    </div>
  );
}
