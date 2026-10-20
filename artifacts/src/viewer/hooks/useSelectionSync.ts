import { useEffect, useMemo, useRef } from 'react';
import type { SelectionMessage } from '../../shared/selection';
import type { BoardSpec } from '../../shared/types';
import { buildSelectionState, fitSelectionMessage } from '../lib/selection';
import type { Inspector } from './useInspector';

const TAB = crypto.randomUUID();

interface Options {
  artifact: string | null;
  boards: Record<string, BoardSpec> | undefined;
  live: boolean | undefined;
  inspector: Pick<Inspector, 'frames' | 'selectedTargets' | 'details' | 'revision'>;
  send: ((message: SelectionMessage) => void) | undefined;
}

export function useSelectionSync({ artifact, boards, live, inspector, send }: Options) {
  const sentRevision = useRef(0);
  const { frames, selectedTargets, details, revision } = inspector;
  const targetKey = JSON.stringify(selectedTargets.map(({ boardId, id }) => [boardId, id]));
  const targets = useMemo(() => JSON.parse(targetKey) as [string, number][], [targetKey]);
  const state = useMemo(() => buildSelectionState({ boards: boards ?? {}, frames, targets: targets.map(([boardId, id]) => ({ boardId, id })), details }), [boards, frames, targets, details]);
  useEffect(() => {
    if (!artifact || !send || !live) return;
    const timer = setTimeout(() => {
      const human = revision !== sentRevision.current;
      sentRevision.current = revision;
      send(fitSelectionMessage({ type: 'selection', artifact, tab: TAB, human, ...state }));
    }, 100);
    return () => clearTimeout(timer);
  }, [artifact, send, live, state, revision]);
}
