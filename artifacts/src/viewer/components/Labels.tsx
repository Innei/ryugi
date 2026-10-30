import { clearCache, measureNaturalWidth, prepare } from '@chenglou/pretext';
import { ActionIcon, DropdownMenu } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import {
  Download,
  Ellipsis,
  Film,
  Image as ImageIcon,
  Maximize2,
  Play,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { type BoardSpec, type GroupSpec, isMediaBoard } from '../../shared/types';
import type { Verdicts } from '../hooks/useVerdicts';
import { t } from '../i18n';
import { boardLabelLayout, type BoardLabelMetrics } from '../lib/board-label';
import { boardReady, canPlay } from '../lib/play';
import { BOARD_LABEL_RULE, GROUP_LABEL_RULE, labelRect, labelSize, type View } from '../lib/view';
import { brand } from '../tokens.stylex';
import { GroupVerdict } from '../verdicts/GroupVerdict';

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
    fontFamily: cssVar.fontFamily,
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  name: { minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  id: {
    flexShrink: 0,
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 11,
    color: cssVar.colorTextSecondary,
  },
  actions: { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginInlineStart: 8 },
  stackedActions: { marginInlineStart: 'auto' },
  parameterChanged: {
    backgroundColor: {
      'default': `color-mix(in srgb, ${brand.accent} 16%, transparent)`,
      ':hover': `color-mix(in srgb, ${brand.accent} 24%, transparent)`,
    },
    color: brand.accentStrong,
  },
  more: {
    display: 'grid',
    placeItems: 'center',
    width: 22,
    height: 22,
    borderWidth: 0,
    borderRadius: 5,
    backgroundColor: 'transparent',
    color: cssVar.colorTextSecondary,
    cursor: 'pointer',
    padding: 0,
  },
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
  parameters?: Record<string, boolean>;
  pending: ReadonlySet<string>;
  playing: ReadonlySet<string>;
  verdicts?: Pick<
    Verdicts,
    'states' | 'evidenceAt' | 'canJudge' | 'pass' | 'startReject' | 'undoPass'
  >;
  versions: Record<string, number>;
  view: View;
}

function useLabelFonts() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!document.fonts) return;
    let active = true;
    const loaded = () => {
      if (!active) return;
      clearCache();
      setVersion((current) => current + 1);
    };
    void document.fonts.ready.then(loaded);
    document.fonts.addEventListener('loadingdone', loaded);
    return () => {
      active = false;
      document.fonts.removeEventListener('loadingdone', loaded);
    };
  }, []);
  return version;
}

function naturalWidth(element: HTMLElement, text: string) {
  const style = getComputedStyle(element);
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return measureNaturalWidth(
    prepare(text, font, { letterSpacing: Number.parseFloat(style.letterSpacing) || 0 }),
  );
}

interface BoardLabelProps extends Pick<
  LabelsProps,
  'contentBase' | 'onExpand' | 'onReplay' | 'onTogglePlay' | 'onToggleParameters'
> {
  active: boolean;
  board: BoardSpec;
  fontsVersion: number;
  id: string;
  interactive: boolean;
  modified?: boolean;
  onStacked: (id: string, stacked: boolean) => void;
  playing: boolean;
  ready: boolean;
  rect: { left: number; top: number; width: number };
  scale: number;
}

function BoardLabel({
  active,
  board,
  contentBase,
  fontsVersion,
  id,
  interactive,
  modified,
  playing,
  ready,
  rect,
  scale,
  onExpand,
  onReplay,
  onTogglePlay,
  onToggleParameters,
  onStacked,
}: BoardLabelProps) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const idRef = useRef<HTMLSpanElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [metrics, setMetrics] = useState<BoardLabelMetrics>({ title: 0, id: 0, actions: 0 });
  const width = rect.width / scale;
  const compact = width < 160;
  const tiny = width < 90;
  const directParameters = modified !== undefined && width >= 60;
  const media = isMediaBoard(board);
  const title = board.title ?? id;
  const identifier = media ? `${id} · ${board.file.split('/').pop()}` : id;
  useLayoutEffect(() => {
    const name = titleRef.current;
    const code = idRef.current;
    const actions = actionsRef.current;
    if (!name || !code || !actions) return;
    const titleWidth = naturalWidth(name, title) + (media ? 18 : 0);
    const idWidth = naturalWidth(code, identifier);
    const measure = () => {
      const next = { title: titleWidth, id: idWidth, actions: actions.offsetWidth };
      setMetrics((current) =>
        current.title === next.title && current.id === next.id && current.actions === next.actions
          ? current
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(actions);
    return () => observer.disconnect();
  }, [
    title,
    identifier,
    media,
    fontsVersion,
    compact,
    tiny,
    directParameters,
    ready,
    interactive,
    playing,
  ]);
  const { stacked, showId } = boardLabelLayout(metrics, rect.width, scale);
  useLayoutEffect(() => {
    onStacked(id, stacked);
    return () => onStacked(id, false);
  }, [id, stacked, onStacked]);
  const download = () =>
    downloadFile(`${contentBase}${board.file}`, board.file.split('/').pop() ?? `${id}.html`);
  return (
    <div
      data-board-label={id}
      data-chrome="board-label"
      {...stylex.props(styles.boardLabel)}
      style={{
        left: rect.left,
        top: rect.top,
        width,
        height: stacked ? 48 : 24,
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'stretch' : 'center',
        transform: `scale(${scale}) translateY(-100%)`,
      }}
    >
      <span {...stylex.props(styles.title)} title={title}>
        {media && (
          <span data-board-type={board.type} {...stylex.props(styles.kind)}>
            {board.type === 'video' ? (
              <Film aria-hidden size={12} />
            ) : (
              <ImageIcon aria-hidden size={12} />
            )}
          </span>
        )}
        <span ref={titleRef} {...stylex.props(styles.name)}>
          {title}
        </span>
        <span hidden={!showId} ref={idRef} {...stylex.props(styles.id)}>
          {identifier}
        </span>
      </span>
      <div ref={actionsRef} {...stylex.props(styles.actions, stacked && styles.stackedActions)}>
        {ready && !compact && (
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
              onClick={download}
            />
          </>
        )}
        {ready && directParameters && (
          <button
            aria-expanded={active}
            type="button"
            aria-label={t(modified ? 'chrome.modifiedParametersBoard' : 'chrome.parametersBoard', {
              id,
            })}
            title={t(modified ? 'chrome.modifiedParametersBoard' : 'chrome.parametersBoard', {
              id,
            })}
            onClick={(event) => onToggleParameters?.(id, event.currentTarget)}
            {...stylex.props(styles.more, modified && styles.parameterChanged)}
          >
            <SlidersHorizontal aria-hidden size={13} />
          </button>
        )}
        {interactive && playing && !compact && (
          <ActionIcon
            aria-label={t('chrome.replayBoard', { id })}
            icon={RotateCcw}
            size={{ blockSize: 22, size: 13 }}
            title={t('chrome.replay')}
            onClick={() => onReplay(id)}
          />
        )}
        {interactive && !tiny && (
          <ActionIcon
            active={playing}
            aria-label={playing ? t('chrome.stopBoard', { id }) : t('chrome.playBoard', { id })}
            aria-pressed={playing}
            icon={Play}
            size={{ blockSize: 22, size: 13 }}
            title={playing ? t('chrome.playing') : t('chrome.play')}
            onClick={() => onTogglePlay(id)}
          />
        )}
        {ready && compact && (
          <DropdownMenu
            items={[
              {
                key: 'expand',
                icon: Maximize2,
                label: t('chrome.expand'),
                onClick: () => onExpand(id),
              },
              { key: 'download', icon: Download, label: t('chrome.download'), onClick: download },
              modified !== undefined && !directParameters
                ? {
                    key: 'parameters',
                    icon: SlidersHorizontal,
                    label: t(
                      modified ? 'chrome.modifiedParametersBoard' : 'chrome.parametersBoard',
                      { id },
                    ),
                    onClick: () => {
                      if (moreRef.current) onToggleParameters?.(id, moreRef.current);
                    },
                  }
                : null,
              interactive && tiny
                ? {
                    key: 'play',
                    icon: Play,
                    label: playing ? t('chrome.playing') : t('chrome.play'),
                    onClick: () => onTogglePlay(id),
                  }
                : null,
              interactive && playing
                ? {
                    key: 'replay',
                    icon: RotateCcw,
                    label: t('chrome.replay'),
                    onClick: () => onReplay(id),
                  }
                : null,
            ]}
          >
            <button
              aria-label={t('chrome.moreBoard', { id })}
              ref={moreRef}
              type="button"
              {...stylex.props(styles.more)}
            >
              <Ellipsis aria-hidden size={13} />
            </button>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
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
  const fontsVersion = useLabelFonts();
  const [stackedBoards, setStackedBoards] = useState<ReadonlySet<string>>(() => new Set());
  const onStacked = useCallback((id: string, stacked: boolean) => {
    setStackedBoards((current) => {
      if (current.has(id) === stacked) return current;
      const next = new Set(current);
      if (stacked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
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
                top:
                  view.y +
                  y * view.k -
                  (boardScale !== null && group.boards.some((board) => stackedBoards.has(board))
                    ? 24 * boardScale
                    : 0),
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
          const ready = boardReady(versions, board.file) && !pending.has(id);
          return (
            <BoardLabel
              active={activeParameters === id}
              board={board}
              contentBase={contentBase}
              fontsVersion={fontsVersion}
              id={id}
              interactive={ready && canPlay(board, versions)}
              key={id}
              modified={parameters?.[id]}
              playing={playing.has(id)}
              ready={ready}
              rect={rect}
              scale={boardScale}
              onExpand={onExpand}
              onReplay={onReplay}
              onStacked={onStacked}
              onToggleParameters={onToggleParameters}
              onTogglePlay={onTogglePlay}
            />
          );
        })}
    </div>
  );
}
