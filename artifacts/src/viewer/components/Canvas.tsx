import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { memo, type Ref } from 'react';

import {
  DEFAULT_TITLE_SIZE,
  STICKY_DEFAULT_W,
  STICKY_FONT_SIZE,
  STICKY_LINE_H,
  STICKY_PAD,
} from '../../shared/geometry';
import { type BoardSpec, isMediaBoard, type NoteSpec } from '../../shared/types';
import type { Inspector } from '../hooks/useInspector';
import type { BoardPhase } from '../lib/board-lifecycle';
import { boardReady, boardSrc, canPlay } from '../lib/play';
import { titleScale, type View } from '../lib/view';
import { brand, color } from '../tokens.stylex';
import { MediaBoard } from './MediaBoard';
import { WritingCursor } from './WritingCursor';

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
    backgroundColor: color.white,
    pointerEvents: 'none',
    outlineWidth: 1,
    outlineStyle: 'solid',
    outlineColor: cssVar.colorBorderSecondary,
  },
  playing: { pointerEvents: 'auto', outlineWidth: 2, outlineColor: brand.accent },
  image: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
    pointerEvents: 'none',
  },
  inspecting: { pointerEvents: 'auto' },
  gesturing: { pointerEvents: 'none' },
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
    boxShadow: `0 1px 2px ${color.shadowSoft}, 0 2px 4px ${color.shadowFaint}`,
  },
});

interface BoardsProps {
  boardBase?: string;
  boards: [string, BoardSpec][];
  boardSandbox?: string;
  contentBase: string;
  culled?: ReadonlySet<string>;
  frameLoaded: Inspector['loaded'];
  frameRef: Inspector['refFor'];
  gesturing?: boolean;
  images?: ReadonlyMap<string, string>;
  inspecting: boolean;
  onExpand?: (id: string) => void;
  pending: ReadonlySet<string>;
  phases?: ReadonlyMap<string, BoardPhase>;
  playing: ReadonlySet<string>;
  replays: Record<string, number>;
  versions: Record<string, number>;
  writing?: string;
}

interface CanvasProps extends BoardsProps {
  agent?: string;
  live?: boolean;
  notes: [string, NoteSpec][];
  view: View;
  worldRef?: Ref<HTMLDivElement>;
}

function stickyColors(stickyColor?: string) {
  if (!stickyColor) return { backgroundColor: color.paperWarm, color: color.inkWarm };
  const hex =
    stickyColor.length === 4
      ? stickyColor
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      : stickyColor.slice(1);
  const [r, g, b] = [0, 2, 4].map((at) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return { backgroundColor: stickyColor, color: luminance > 0.179 ? color.black : color.white };
}

const NO_PHASES: ReadonlyMap<string, BoardPhase> = new Map();
const NO_IMAGES: ReadonlyMap<string, string> = new Map();
const NO_IDS: ReadonlySet<string> = new Set();

function slotStyle(board: BoardSpec, drawing: boolean, culled: boolean, capturing = false) {
  return {
    left: board.x,
    top: board.y,
    width: board.w,
    height: board.h,
    ...(drawing ? { outlineWidth: 'calc(2px / var(--zoom, 1))' } : {}),
    ...(culled ? (capturing ? { visibility: 'hidden' as const } : { display: 'none' }) : {}),
  };
}

const Boards = memo(function Boards({
  boardBase,
  boards,
  boardSandbox = 'allow-scripts',
  contentBase,
  culled = NO_IDS,
  frameLoaded,
  frameRef,
  gesturing = false,
  images = NO_IMAGES,
  inspecting,
  pending,
  phases = NO_PHASES,
  playing,
  replays,
  versions,
  writing,
}: BoardsProps) {
  return boards.map(([id, board]) => {
    if (isMediaBoard(board)) return null;
    const ready = boardReady(versions, board.file) && !pending.has(id);
    const phase = phases.get(id) ?? 'mounted';
    const image = images.get(id) ?? null;
    const showImage = !!image && (phase === 'unloaded' || phase === 'restoring');
    const mountFrame = ready && (phase !== 'unloaded' || !image);
    const drawing = id === writing;
    return (
      <div
        aria-busy={drawing || undefined}
        data-board={id}
        key={id}
        {...stylex.props(styles.slot, !ready && styles.skeleton, drawing && styles.drawing)}
        style={slotStyle(board, drawing, culled.has(id), phase === 'capturing')}
      >
        {mountFrame && (
          <iframe
            ref={frameRef(id)}
            sandbox={boardSandbox}
            style={gesturing ? { pointerEvents: 'none' } : undefined}
            title={board.title ?? id}
            src={boardSrc(
              boardBase ?? contentBase,
              board.file,
              versions[board.file] ?? 0,
              replays[id] ?? 0,
            )}
            onLoad={() => frameLoaded(id)}
            {...stylex.props(
              styles.board,
              inspecting && styles.inspecting,
              canPlay(board, versions) && playing.has(id) && styles.playing,
              gesturing && styles.gesturing,
            )}
          />
        )}
        {showImage && (
          <img
            alt=""
            decoding="async"
            draggable={false}
            src={image!}
            {...stylex.props(styles.image)}
          />
        )}
        {!ready && (
          <span {...stylex.props(styles.skeletonText)}>{drawing ? 'Drawing…' : 'Waiting…'}</span>
        )}
      </div>
    );
  });
});

function MediaBoards({
  boards,
  contentBase,
  culled = NO_IDS,
  pending,
  versions,
  writing,
  zoom,
  onExpand,
}: Pick<
  BoardsProps,
  'boards' | 'contentBase' | 'culled' | 'pending' | 'versions' | 'writing' | 'onExpand'
> & { zoom: number }) {
  return boards.map(([id, board]) => {
    if (!isMediaBoard(board)) return null;
    const ready = boardReady(versions, board.file) && !pending.has(id);
    const drawing = id === writing;
    return (
      <div
        aria-busy={drawing || undefined}
        data-board={id}
        key={id}
        {...stylex.props(styles.slot, !ready && styles.skeleton, drawing && styles.drawing)}
        style={slotStyle(board, drawing, culled.has(id))}
      >
        {ready ? (
          <MediaBoard
            board={board}
            id={id}
            src={boardSrc(contentBase, board.file, versions[board.file] ?? 0, 0)}
            zoom={zoom}
            onExpand={onExpand && (() => onExpand(id))}
          />
        ) : (
          <span {...stylex.props(styles.skeletonText)}>{drawing ? 'Drawing…' : 'Waiting…'}</span>
        )}
      </div>
    );
  });
}

export function Canvas({
  boardBase,
  boardSandbox,
  view,
  worldRef,
  phases,
  images,
  culled,
  gesturing,
  boards,
  notes,
  contentBase,
  versions,
  pending,
  playing,
  replays,
  inspecting,
  frameRef,
  frameLoaded,
  live,
  writing,
  agent,
  onExpand,
}: CanvasProps) {
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
    <div
      ref={worldRef}
      {...stylex.props(styles.world)}
      style={
        worldRef
          ? undefined
          : {
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
              ['--zoom' as string]: view.k,
            }
      }
    >
      <Boards
        boardBase={boardBase}
        boardSandbox={boardSandbox}
        boards={boards}
        contentBase={contentBase}
        culled={culled}
        frameLoaded={frameLoaded}
        frameRef={frameRef}
        gesturing={gesturing}
        images={images}
        inspecting={inspecting}
        pending={pending}
        phases={phases}
        playing={playing}
        replays={replays}
        versions={versions}
        writing={writing}
        onExpand={onExpand}
      />
      <MediaBoards
        boards={boards}
        contentBase={contentBase}
        culled={culled}
        pending={pending}
        versions={versions}
        writing={writing}
        zoom={view.k}
        onExpand={onExpand}
      />
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
        <WritingCursor
          agent={agent ?? 'Agent'}
          title={active.title ?? cursor!}
          x={active.x + Math.min(64, active.w * 0.15)}
          y={active.y + Math.min(80, active.h * 0.2)}
          zoom={view.k}
        />
      )}
    </div>
  );
}
