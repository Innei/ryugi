import { measureNaturalWidth, prepare } from '@chenglou/pretext';
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
import { useLayoutEffect, useRef, useState } from 'react';

import { type BoardSpec, isMediaBoard } from '../../shared/types';
import { t } from '../i18n';
import { BOARD_LABEL_HEIGHT, boardLabelLayout, type BoardLabelMetrics } from '../lib/board-label';
import { brand } from '../tokens.stylex';

export const BOARD_LABEL_FONT = 12;

function downloadFile(href: string, name: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
}

const styles = stylex.create({
  boardLabel: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'flex-start',
    transformOrigin: '0 0',
    paddingBottom: 2,
    color: cssVar.colorTextSecondary,
    pointerEvents: 'auto',
  },
  title: {
    flex: 1,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    minWidth: 0,
    overflow: 'hidden',
    paddingTop: 3,
    fontSize: BOARD_LABEL_FONT,
    lineHeight: '16px',
    fontFamily: cssVar.fontFamily,
    overflowWrap: 'anywhere',
  },
  name: {},
  id: {
    marginInlineStart: 6,
    fontFamily: cssVar.fontFamilyCode,
    fontSize: 11,
    color: cssVar.colorTextSecondary,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
    height: 22,
    marginInlineStart: 8,
  },
  actionActive: {
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
  kind: {
    display: 'inline-flex',
    marginInlineEnd: 4,
    verticalAlign: '-2px',
    color: cssVar.colorTextTertiary,
  },
});

function naturalWidth(element: HTMLElement, text: string) {
  const style = getComputedStyle(element);
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return measureNaturalWidth(
    prepare(text, font, { letterSpacing: Number.parseFloat(style.letterSpacing) || 0 }),
  );
}

export interface BoardLabelProps {
  active: boolean;
  board: BoardSpec;
  contentBase: string;
  fontsVersion: number;
  id: string;
  interactive: boolean;
  modified?: boolean;
  onExpand: (id: string) => void;
  onLines: (id: string, lines: 1 | 2) => void;
  onReplay: (id: string) => void;
  onToggleParameters?: (id: string, trigger: HTMLButtonElement) => void;
  onTogglePlay: (id: string) => void;
  playing: boolean;
  ready: boolean;
  rect: { left: number; top: number; width: number };
  scale: number;
}

export function BoardLabel({
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
  onLines,
}: BoardLabelProps) {
  const titleRef = useRef<HTMLSpanElement>(null);
  const idRef = useRef<HTMLSpanElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [metrics, setMetrics] = useState<BoardLabelMetrics>({
    title: 0,
    id: 0,
    actions: 0,
    lead: 0,
    tail: 0,
  });
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
      const next = {
        title: titleWidth,
        id: idWidth,
        actions: actions.offsetWidth,
        lead: 0,
        tail: 0,
      };
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
  const { lines, showId } = boardLabelLayout(metrics, rect.width, scale);
  useLayoutEffect(() => {
    onLines(id, lines);
    return () => onLines(id, 1);
  }, [id, lines, onLines]);
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
        height: BOARD_LABEL_HEIGHT[lines],
        transform: `scale(${scale}) translateY(-100%)`,
      }}
    >
      <span {...stylex.props(styles.title)} style={{ WebkitLineClamp: lines }} title={title}>
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
      <div ref={actionsRef} {...stylex.props(styles.actions)}>
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
            {...stylex.props(styles.more, modified && styles.actionActive)}
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
            fill={playing ? 'currentColor' : 'none'}
            icon={Play}
            size={{ blockSize: 22, size: 13 }}
            title={playing ? t('chrome.playing') : t('chrome.play')}
            onClick={() => onTogglePlay(id)}
            {...stylex.props(playing && styles.actionActive)}
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
