import { ActionIcon } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Download, Film, Image as ImageIcon, Maximize2, Play, RotateCcw } from 'lucide-react';
import { isMediaBoard, type BoardSpec, type GroupSpec } from '../../shared/types';
import { boardReady, canPlay } from '../lib/play';
import { BOARD_LABEL_RULE, GROUP_LABEL_RULE, labelRect, labelSize, type View } from '../lib/view';

const ACTIONS_MIN_WIDTH = 150;
const PLAY_MIN_WIDTH = 240;
const PLAY_ACCENT = '#8b7cf8';
const BOARD_LABEL_FONT = 12;
const GROUP_LABEL_FONT = 13;
const GROUP_LABEL_GAP = 26;
const scaleOf = (size: number | null, font: number) => (size === null ? null : size / font);

function downloadFile(href: string, name: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
}

const styles = stylex.create({
  layer: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' },
  boardLabel: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    height: 24,
    transformOrigin: '0 0',
    paddingBottom: 2,
    color: cssVar.colorTextSecondary,
    pointerEvents: 'auto',
  },
  title: {
    flex: 1,
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    minWidth: 0,
    overflow: 'hidden',
    fontSize: BOARD_LABEL_FONT,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  id: { fontFamily: cssVar.fontFamilyCode, fontSize: 11, color: cssVar.colorTextTertiary },
  kind: { flexShrink: 0, alignSelf: 'center', display: 'flex', color: cssVar.colorTextTertiary },
  groupLabel: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transformOrigin: '0 0',
    fontSize: GROUP_LABEL_FONT,
    fontWeight: 600,
    color: cssVar.colorText,
    whiteSpace: 'nowrap',
  },
  play: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 20,
    marginInlineStart: 4,
    paddingInline: 7,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: PLAY_ACCENT,
    borderRadius: 6,
    backgroundColor: { default: 'transparent', ':hover': 'rgba(139, 124, 248, 0.14)' },
    color: PLAY_ACCENT,
    fontFamily: cssVar.fontFamily,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  playOn: { backgroundColor: { default: PLAY_ACCENT, ':hover': PLAY_ACCENT }, color: '#ffffff' },
  chip: {
    paddingInline: 5,
    borderRadius: 4,
    backgroundColor: cssVar.colorText,
    color: cssVar.colorBgContainer,
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 11,
    fontWeight: 500,
    lineHeight: '18px',
  },
});

interface LabelsProps {
  view: View;
  boards: [string, BoardSpec][];
  groups: [string, GroupSpec][];
  allBoards: Record<string, BoardSpec>;
  contentBase: string;
  versions: Record<string, number>;
  pending: ReadonlySet<string>;
  playing: ReadonlySet<string>;
  onExpand: (id: string) => void;
  onTogglePlay: (id: string) => void;
  onReplay: (id: string) => void;
}

export function Labels({
  view,
  boards,
  groups,
  allBoards,
  contentBase,
  versions,
  pending,
  playing,
  onExpand,
  onTogglePlay,
  onReplay,
}: LabelsProps) {
  const groupScale = scaleOf(labelSize(GROUP_LABEL_RULE, view.k), GROUP_LABEL_FONT);
  const boardScale = scaleOf(labelSize(BOARD_LABEL_RULE, view.k), BOARD_LABEL_FONT);
  return (
    <div {...stylex.props(styles.layer)}>
      {groupScale !== null &&
        groups.map(([id, group]) => {
          const members = group.boards.map((m) => allBoards[m]).filter((b): b is BoardSpec => Boolean(b));
          if (members.length === 0) return null;
          const x = Math.min(...members.map((b) => b.x));
          const y = Math.min(...members.map((b) => b.y));
          return (
            <div
              key={id}
              {...stylex.props(styles.groupLabel)}
              style={{
                left: view.x + x * view.k,
                top: view.y + y * view.k,
                transform: `scale(${groupScale}) translateY(calc(-100% - ${GROUP_LABEL_GAP}px))`,
              }}
            >
              <span {...stylex.props(styles.chip)}>{id}</span>
              {group.title}
            </div>
          );
        })}
      {boardScale !== null &&
        boards.map(([id, board]) => {
          const rect = labelRect(board, view);
          if (!rect) return null;
          const width = rect.width / boardScale;
          const ready = boardReady(versions, board.file) && !pending.has(id);
          const interactive = ready && canPlay(board, versions);
          return (
            <div
              key={id}
              data-chrome="board-label"
              {...stylex.props(styles.boardLabel)}
              style={{ left: rect.left, top: rect.top, width, transform: `scale(${boardScale}) translateY(-100%)` }}
            >
              <span {...stylex.props(styles.title)}>
                {isMediaBoard(board) && (
                  <span data-board-type={board.type} {...stylex.props(styles.kind)}>
                    {board.type === 'video' ? <Film size={12} /> : <ImageIcon size={12} />}
                  </span>
                )}
                {board.title ?? id}
                <span {...stylex.props(styles.id)}>{isMediaBoard(board) ? `${id} · ${board.file.split('/').pop()}` : id}</span>
              </span>
              {ready && width >= ACTIONS_MIN_WIDTH && (
                <>
                  <ActionIcon icon={Maximize2} size={{ blockSize: 22, size: 13 }} title="Expand" aria-label={`Expand ${id}`} onClick={() => onExpand(id)} />
                  <ActionIcon
                    icon={Download}
                    size={{ blockSize: 22, size: 13 }}
                    title="Download"
                    aria-label={`Download ${id}`}
                    onClick={() => downloadFile(`${contentBase}${board.file}`, board.file.split('/').pop() ?? `${id}.html`)}
                  />
                </>
              )}
              {interactive && width >= PLAY_MIN_WIDTH && playing.has(id) && (
                <ActionIcon icon={RotateCcw} size={{ blockSize: 22, size: 13 }} title="Replay" aria-label={`Replay ${id}`} onClick={() => onReplay(id)} />
              )}
              {interactive && width >= PLAY_MIN_WIDTH && (
                <button
                  type="button"
                  aria-pressed={playing.has(id)}
                  aria-label={`${playing.has(id) ? 'Stop' : 'Play'} ${id}`}
                  onClick={() => onTogglePlay(id)}
                  {...stylex.props(styles.play, playing.has(id) && styles.playOn)}
                >
                  <Play size={11} strokeWidth={2.4} />
                  {playing.has(id) ? 'PLAYING' : 'PLAY'}
                </button>
              )}
            </div>
          );
        })}
    </div>
  );
}
