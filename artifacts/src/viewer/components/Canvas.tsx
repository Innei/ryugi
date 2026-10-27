import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_TITLE_SIZE, STICKY_DEFAULT_W, STICKY_FONT_SIZE, STICKY_LINE_H, STICKY_PAD } from '../../shared/geometry';
import { isMediaBoard, type BoardSpec, type NoteSpec } from '../../shared/types';
import type { Inspector } from '../hooks/useInspector';
import type { BoardRender } from '../lib/board-tiers';
import { boardReady, boardSrc, canPlay } from '../lib/play';
import { titleScale, type View } from '../lib/view';
import { MediaBoard } from './MediaBoard';
import { WritingCursor } from './WritingCursor';
import { brand } from '../tokens.stylex';

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
  playing: { pointerEvents: 'auto', outlineWidth: 2, outlineColor: brand.accent },
  image: { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' },
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
    outlineColor: brand.accent,
    backgroundImage: `linear-gradient(110deg, transparent, color-mix(in srgb, ${brand.accent} 10%, transparent), transparent)`,
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
  live?: boolean;
  writing?: string;
  agent?: string;
  view: View;
  renders: ReadonlyMap<string, BoardRender>;
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
  onImageError?: (id: string, src: string) => void;
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

const HIDDEN = { visibility: 'hidden' } as const;
// Transparent, not hidden: a pinch latches onto the frame it started over, and a hidden frame drops the rest of it.
const COVERED = { opacity: 0 } as const;

function BoardLayers({ image, showImage, hideFrame, frame, onError }: {
  image: string | null;
  showImage: boolean;
  hideFrame: boolean;
  frame: ((hidden: boolean) => ReactNode) | null;
  onError: (src: string) => void;
}) {
  const [ready, setReady] = useState<string | null>(null);
  const [covered, setCovered] = useState(false);
  const [holding, setHolding] = useState(false);
  const showing = useRef(showImage);
  useEffect(() => {
    if (!showImage || !ready) {
      setCovered(false);
      return;
    }
    const id = requestAnimationFrame(() => setCovered(true));
    return () => cancelAnimationFrame(id);
  }, [showImage, ready]);
  // A frame hidden through a zoom repaints at the new scale over a frame or two, so its snapshot stays on top until then.
  useEffect(() => {
    const was = showing.current;
    showing.current = showImage;
    if (showImage || !was) return;
    setHolding(true);
    let id = requestAnimationFrame(() => { id = requestAnimationFrame(() => setHolding(false)); });
    return () => cancelAnimationFrame(id);
  }, [showImage]);
  const visible = showImage || holding;
  const sources = !image ? [] : ready && ready !== image ? [ready, image] : [image];
  return (
    <>
      {frame?.(hideFrame && covered)}
      {sources.map((source) => (
        <img key={source} alt="" src={source} decoding="async" draggable={false}
          onLoad={source === image ? (event) => {
            const decoded = event.currentTarget.decode?.() ?? Promise.resolve();
            void decoded.catch(() => undefined).then(() => setReady(image));
          } : undefined}
          onError={source === image ? () => onError(image) : undefined}
          style={visible && source === ready ? undefined : HIDDEN}
          {...stylex.props(styles.image)} />
      ))}
    </>
  );
}

export function Canvas({ view, renders, boards, notes, contentBase, versions, pending, playing, replays, inspecting, frameRef, frameLoaded, live, writing, agent, onExpand, onImageError }: CanvasProps) {
  let cursor = writing;
  if (live) {
    cursor = undefined;
    let latest = 0;
    for (const [id, board] of boards) {
      const version = versions[board.file] ?? 0;
      if (isMediaBoard(board) || pending.has(id) || version <= latest) continue;
      cursor = id;
      latest = version;
    }
  }
  const active = boards.find(([id]) => id === cursor)?.[1];
  return (
    <div {...stylex.props(styles.world)} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
      {boards.map(([id, board]) => {
        const ready = boardReady(versions, board.file) && !pending.has(id);
        const render = ready ? renders.get(id) : undefined;
        const media = isMediaBoard(board);
        const mounted = media ? !!render && (render.tier !== 'empty' || playing.has(id)) : !!render?.mounted;
        const image = !media ? render?.image ?? null : null;
        const drawing = id === writing;
        const position = { left: board.x, top: board.y, width: board.w, height: board.h };
        return (
          <div key={id} data-board={id} aria-busy={drawing || undefined}
            {...stylex.props(styles.slot, !mounted && styles.skeleton, drawing && styles.drawing)}
            style={{ ...position, ...(drawing ? { outlineWidth: 2 / view.k } : {}) }}>
            {mounted && media ? (
              <MediaBoard id={id} board={board} src={boardSrc(contentBase, board.file, versions[board.file] ?? 0, 0)} zoom={view.k} onExpand={onExpand && (() => onExpand(id))} />
            ) : (
              <>
              <BoardLayers
                image={image}
                showImage={!mounted || !!render?.overlay}
                hideFrame={!!render?.hidden}
                onError={(src) => onImageError?.(id, src)}
                frame={mounted ? (hidden) => (
                  <iframe
                    ref={frameRef(id)}
                    onLoad={() => frameLoaded(id)}
                    style={hidden ? COVERED : undefined}
                    title={board.title ?? id}
                    src={boardSrc(contentBase, board.file, versions[board.file] ?? 0, replays[id] ?? 0)}
                    sandbox="allow-scripts"
                    {...stylex.props(styles.board, inspecting && styles.inspecting, canPlay(board, versions) && playing.has(id) && styles.playing)}
                  />
                ) : null}
              />
              {!ready && <span {...stylex.props(styles.skeletonText)}>{drawing ? 'Drawing…' : 'Waiting…'}</span>}
              </>
            )}
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
          zoom={view.k} agent={agent ?? 'Agent'} title={active.title ?? cursor!} />
      )}
    </div>
  );
}
