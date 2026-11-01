import { clearCache } from '@chenglou/pretext';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { type Ref, useCallback, useEffect, useState } from 'react';

import type { BoardSpec, GroupSpec } from '../../shared/types';
import type { Choices } from '../hooks/useChoices';
import type { Verdicts } from '../hooks/useVerdicts';
import { BOARD_LABEL_HEIGHT } from '../lib/board-label';
import { boardReady, canPlay } from '../lib/play';
import { BOARD_LABEL_RULE, GROUP_LABEL_RULE, labelRect, labelSize, type View } from '../lib/view';
import { brand } from '../tokens.stylex';
import { GroupVerdict } from '../verdicts/GroupVerdict';
import { BOARD_LABEL_FONT, BoardLabel } from './BoardLabel';

const GROUP_LABEL_FONT = 13;
const GROUP_LABEL_GAP = 26;
const scaleOf = (size: number | null, font: number) => (size === null ? null : size / font);

const styles = stylex.create({
  layer: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' },
  overlay: { position: 'absolute', inset: 0 },
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
  chosen: {
    position: 'absolute',
    boxSizing: 'border-box',
    borderWidth: 3,
    borderStyle: 'solid',
    borderColor: brand.accent,
    borderRadius: 2,
    pointerEvents: 'none',
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
  choices?: Pick<Choices, 'boardChoice' | 'choose' | 'chosenBoards'>;
  contentBase: string;
  groups: [string, GroupSpec][];
  onExpand: (id: string) => void;
  onReplay: (id: string) => void;
  onToggleParameters?: (id: string, trigger: HTMLButtonElement) => void;
  onTogglePlay: (id: string) => void;
  overlayRef?: Ref<HTMLDivElement>;
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
  choices,
  overlayRef,
}: LabelsProps) {
  const fontsVersion = useLabelFonts();
  const [wrappedBoards, setWrappedBoards] = useState<ReadonlySet<string>>(() => new Set());
  const onLines = useCallback((id: string, lines: 1 | 2) => {
    setWrappedBoards((current) => {
      const wrapped = lines === 2;
      if (current.has(id) === wrapped) return current;
      const next = new Set(current);
      if (wrapped) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const groupScale = scaleOf(labelSize(GROUP_LABEL_RULE, view.k), GROUP_LABEL_FONT);
  const boardScale = scaleOf(labelSize(BOARD_LABEL_RULE, view.k), BOARD_LABEL_FONT);
  return (
    <div {...stylex.props(styles.layer)}>
      <div ref={overlayRef} {...stylex.props(styles.overlay)}>
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
                    (boardScale !== null && group.boards.some((board) => wrappedBoards.has(board))
                      ? (BOARD_LABEL_HEIGHT[2] - BOARD_LABEL_HEIGHT[1]) * boardScale
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
        {choices &&
          boards.map(([id, board]) =>
            choices.chosenBoards.has(id) ? (
              <div
                data-chosen-board={id}
                key={`chosen-${id}`}
                {...stylex.props(styles.chosen)}
                style={{
                  left: view.x + board.x * view.k,
                  top: view.y + board.y * view.k,
                  width: board.w * view.k,
                  height: board.h * view.k,
                }}
              />
            ) : null,
          )}
        {boardScale !== null &&
          boards.map(([id, board]) => {
            const rect = labelRect(board, view);
            if (!rect) return null;
            const ready = boardReady(versions, board.file) && !pending.has(id);
            return (
              <BoardLabel
                active={activeParameters === id}
                board={board}
                choice={choices?.boardChoice(id)}
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
                onChoose={choices?.choose}
                onExpand={onExpand}
                onLines={onLines}
                onReplay={onReplay}
                onToggleParameters={onToggleParameters}
                onTogglePlay={onTogglePlay}
              />
            );
          })}
      </div>
    </div>
  );
}
