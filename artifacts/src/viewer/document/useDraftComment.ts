import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { LEAVE_MS } from './DraftPanel';
import { createDrafts, draftKey } from './drafts';
import { useDraftHighlight } from './useAnchors';
import type { SelectionTarget } from './useSelectionComment';

interface Draft {
  initial: string;
  target: SelectionTarget;
}

export function useDraftComment(clearSelection: () => void) {
  const drafts = useMemo(createDrafts, []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [leaving, setLeaving] = useState(false);
  const text = useRef('');
  const timer = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  useDraftHighlight(leaving ? null : (draft?.target.range ?? null));

  const open = useCallback(
    (target: SelectionTarget) => {
      window.clearTimeout(timer.current);
      const initial = drafts.take(draftKey(target.blockId, target.quote));
      text.current = initial;
      setLeaving(false);
      setDraft({ target, initial });
      window.getSelection()?.removeAllRanges();
      clearSelection();
    },
    [drafts, clearSelection],
  );

  const close = useCallback(
    (keepText: boolean) => {
      if (!draft) return;
      drafts.save(draftKey(draft.target.blockId, draft.target.quote), keepText ? text.current : '');
      setLeaving(true);
      timer.current = window.setTimeout(() => {
        setDraft(null);
        setLeaving(false);
      }, LEAVE_MS);
    },
    [draft, drafts],
  );

  useEffect(() => {
    if (!draft || leaving) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || toolbarRef.current?.contains(target)) return;
      close(true);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [draft, leaving, close]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return {
    draft,
    leaving,
    restored: Boolean(draft?.initial),
    open,
    close,
    onText: (next: string) => {
      text.current = next;
    },
    panelRef,
    toolbarRef,
  };
}
