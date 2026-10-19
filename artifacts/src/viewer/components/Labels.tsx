import { ActionIcon } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Download, Maximize2, Play, RotateCcw } from 'lucide-react';
import type { BoardSpec, GroupSpec } from '../../shared/types';
import { labelRect, type View } from '../lib/view';

const ACTIONS_MIN_WIDTH = 150;
const PLAY_MIN_WIDTH = 240;
const PLAY_ACCENT = '#8b7cf8';

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
    transform: 'translateY(-100%)',
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
    fontSize: 12,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  id: { fontFamily: cssVar.fontFamilyCode, fontSize: 11, color: cssVar.colorTextTertiary },
  groupLabel: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transform: 'translateY(calc(-100% - 26px))',
    fontSize: 13,
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
  playing: ReadonlySet<string>;
  onExpand: (id: string) => void;
  onTogglePlay: (id: string) => void;
  onReplay: (id: string) => void;
}

export function Labels({ view, boards, groups, allBoards, contentBase, playing, onExpand, onTogglePlay, onReplay }: LabelsProps) {
  return (
    <div {...stylex.props(styles.layer)}>
      {groups.map(([id, group]) => {
        const members = group.boards.map((m) => allBoards[m]).filter((b): b is BoardSpec => Boolean(b));
        if (members.length === 0) return null;
        const x = Math.min(...members.map((b) => b.x));
        const y = Math.min(...members.map((b) => b.y));
        return (
          <div key={id} {...stylex.props(styles.groupLabel)} style={{ left: view.x + x * view.k, top: view.y + y * view.k }}>
            <span {...stylex.props(styles.chip)}>{id}</span>
            {group.title}
          </div>
        );
      })}
      {boards.map(([id, board]) => {
        const rect = labelRect(board, view);
        if (!rect) return null;
        return (
          <div key={id} data-chrome {...stylex.props(styles.boardLabel)} style={rect}>
            <span {...stylex.props(styles.title)}>
              {board.title ?? id}
              <span {...stylex.props(styles.id)}>{id}</span>
            </span>
            {rect.width >= ACTIONS_MIN_WIDTH && (
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
            {rect.width >= PLAY_MIN_WIDTH && playing.has(id) && (
              <ActionIcon icon={RotateCcw} size={{ blockSize: 22, size: 13 }} title="Replay" aria-label={`Replay ${id}`} onClick={() => onReplay(id)} />
            )}
            {rect.width >= PLAY_MIN_WIDTH && (
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
