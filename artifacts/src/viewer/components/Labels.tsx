import { ActionIcon } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import {
  Download,
  Film,
  Image as ImageIcon,
  Maximize2,
  Play,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';

import { type BoardSpec, type GroupSpec, isMediaBoard } from '../../shared/types';
import type { Verdicts } from '../hooks/useVerdicts';
import { t } from '../i18n';
import { boardReady, canPlay } from '../lib/play';
import { BOARD_LABEL_RULE, GROUP_LABEL_RULE, labelRect, labelSize, type View } from '../lib/view';
import { brand } from '../tokens.stylex';
import { GroupVerdict } from '../verdicts/GroupVerdict';

const ACTIONS_MIN_WIDTH = 150;
const PLAY_MIN_WIDTH = 240;
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
  judged: { pointerEvents: 'auto' },
  play: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    height: 20,
    marginInlineStart: 4,
    paddingInline: 7,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: brand.accent,
    borderRadius: 6,
    backgroundColor: {
      'default': 'transparent',
      ':hover': `color-mix(in srgb, ${brand.accent} 14%, transparent)`,
    },
    color: brand.accentStrong,
    fontFamily: cssVar.fontFamily,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  },
  playOn: {
    backgroundColor: { 'default': brand.accentStrong, ':hover': brand.accentStrong },
    color: '#ffffff',
  },
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
  activeParameters?: string | null;
  allBoards: Record<string, BoardSpec>;
  boards: [string, BoardSpec][];
  contentBase: string;
  groups: [string, GroupSpec][];
  onExpand: (id: string) => void;
  onReplay: (id: string) => void;
  onToggleParameters?: (id: string, trigger: HTMLButtonElement) => void;
  onTogglePlay: (id: string) => void;
  parameters?: Record<string, number>;
  pending: ReadonlySet<string>;
  playing: ReadonlySet<string>;
  verdicts?: Pick<
    Verdicts,
    'states' | 'evidenceAt' | 'canJudge' | 'pass' | 'startReject' | 'undoPass'
  >;
  versions: Record<string, number>;
  view: View;
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
  parameters,
  activeParameters,
  onToggleParameters,
  verdicts,
}: LabelsProps) {
  const groupScale = scaleOf(labelSize(GROUP_LABEL_RULE, view.k), GROUP_LABEL_FONT);
  const boardScale = scaleOf(labelSize(BOARD_LABEL_RULE, view.k), BOARD_LABEL_FONT);
  return (
    <div {...stylex.props(styles.layer)}>
      {groupScale !== null &&
        groups.map(([id, group]) => {
          const members = group.boards
            .map((m) => allBoards[m])
            .filter((b): b is BoardSpec => Boolean(b));
          if (members.length === 0) return null;
          const x = Math.min(...members.map((b) => b.x));
          const y = Math.min(...members.map((b) => b.y));
          const verdict = verdicts?.states[id];
          return (
            <div
              data-chrome={verdict ? 'group-label' : undefined}
              data-group-label={id}
              key={id}
              {...stylex.props(styles.groupLabel, verdict && styles.judged)}
              style={{
                left: view.x + x * view.k,
                top: view.y + y * view.k,
                transform: `scale(${groupScale}) translateY(calc(-100% - ${GROUP_LABEL_GAP}px))`,
              }}
            >
              <span {...stylex.props(styles.chip)}>{id}</span>
              {group.title}
              {verdict && verdicts && (
                <GroupVerdict
                  canJudge={verdicts.canJudge}
                  evidenceAt={verdicts.evidenceAt(id)}
                  verdict={verdict}
                  onPass={() => verdicts.pass(id)}
                  onReject={() => verdicts.startReject(id)}
                  onUndo={() => verdicts.undoPass(id)}
                />
              )}
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
              data-chrome="board-label"
              key={id}
              {...stylex.props(styles.boardLabel)}
              style={{
                left: rect.left,
                top: rect.top,
                width,
                transform: `scale(${boardScale}) translateY(-100%)`,
              }}
            >
              <span {...stylex.props(styles.title)}>
                {isMediaBoard(board) && (
                  <span data-board-type={board.type} {...stylex.props(styles.kind)}>
                    {board.type === 'video' ? <Film size={12} /> : <ImageIcon size={12} />}
                  </span>
                )}
                {board.title ?? id}
                <span {...stylex.props(styles.id)}>
                  {isMediaBoard(board) ? `${id} · ${board.file.split('/').pop()}` : id}
                </span>
              </span>
              {ready && width >= ACTIONS_MIN_WIDTH && (
                <>
                  <ActionIcon
                    aria-label={t('chrome.expandBoard', { id })}
                    icon={Maximize2}
                    size={{ blockSize: 22, size: 13 }}
                    title={t('chrome.expand')}
                    onClick={() => onExpand(id)}
                  />
                  <ActionIcon
                    aria-label={t('chrome.downloadBoard', { id })}
                    icon={Download}
                    size={{ blockSize: 22, size: 13 }}
                    title={t('chrome.download')}
                    onClick={() =>
                      downloadFile(
                        `${contentBase}${board.file}`,
                        board.file.split('/').pop() ?? `${id}.html`,
                      )
                    }
                  />
                </>
              )}
              {ready && parameters?.[id] !== undefined && width >= ACTIONS_MIN_WIDTH && (
                <button
                  aria-expanded={activeParameters === id}
                  aria-label={t('chrome.parametersBoard', { id })}
                  type="button"
                  onClick={(event) => onToggleParameters?.(id, event.currentTarget)}
                  {...stylex.props(styles.play, activeParameters === id && styles.playOn)}
                >
                  <SlidersHorizontal size={11} />
                  {t('chrome.parameters')} {parameters[id] || '!'}
                </button>
              )}
              {interactive && width >= PLAY_MIN_WIDTH && playing.has(id) && (
                <ActionIcon
                  aria-label={t('chrome.replayBoard', { id })}
                  icon={RotateCcw}
                  size={{ blockSize: 22, size: 13 }}
                  title={t('chrome.replay')}
                  onClick={() => onReplay(id)}
                />
              )}
              {interactive && width >= PLAY_MIN_WIDTH && (
                <button
                  aria-pressed={playing.has(id)}
                  type="button"
                  aria-label={
                    playing.has(id) ? t('chrome.stopBoard', { id }) : t('chrome.playBoard', { id })
                  }
                  onClick={() => onTogglePlay(id)}
                  {...stylex.props(styles.play, playing.has(id) && styles.playOn)}
                >
                  <Play size={11} strokeWidth={2.4} />
                  {playing.has(id) ? t('chrome.playing') : t('chrome.play')}
                </button>
              )}
            </div>
          );
        })}
    </div>
  );
}
