import * as stylex from '@stylexjs/stylex';
import type { LexicalEditor } from 'lexical';
import { type ReactNode, useState } from 'react';

import type { Thread } from '../../shared/comments';
import { sheetHeight } from '../components/BottomSheet';
import type { ThreadActions } from './CommentCard';
import type { DocumentHistoryView } from './DocumentHistory';
import { editMenuPosition } from './layoutCards';
import { EDIT_MENU_HEIGHT, EDIT_MENU_WIDTH, PhoneEditMenu } from './PhoneEditMenu';
import { PhoneSheet, raiseSheet, SHEET_HALF, SHEET_PEEK } from './PhoneSheet';
import { threadAtPoint, useAnchors, useDraftHighlight, useHighlights } from './useAnchors';
import type { SelectionTarget } from './useSelectionComment';

const TOP_BAR = 52;

const styles = stylex.create({
  main: { position: 'relative', paddingTop: 20, paddingInline: 20, paddingBottom: 120 },
  dock: {
    position: 'fixed',
    top: TOP_BAR,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    pointerEvents: 'none',
  },
});

interface Props {
  actions?: ThreadActions;
  agent?: string;
  canComment: boolean;
  canEdit: boolean;
  children: ReactNode;
  clearSelection: () => void;
  editor: LexicalEditor | null;
  history?: DocumentHistoryView | null;
  offline: boolean;
  onCreate: (target: SelectionTarget, text: string) => Promise<boolean>;
  onEdit: (target: SelectionTarget) => void;
  onMain?: (element: HTMLElement | null) => void;
  selection: SelectionTarget | null;
  threads: Thread[];
}

export function PhoneLayout({
  editor,
  threads,
  actions,
  agent,
  canComment,
  canEdit,
  offline,
  selection,
  clearSelection,
  onCreate,
  onEdit,
  onMain,
  history,
  children,
}: Props) {
  const [main, setMain] = useState<HTMLElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [snap, setSnap] = useState(SHEET_PEEK);
  const [draft, setDraft] = useState<SelectionTarget | null>(null);
  const anchors = useAnchors(editor, threads, main);
  useHighlights(anchors, threads, activeId);
  useDraftHighlight(draft?.range ?? null);

  const done = () => {
    window.getSelection()?.removeAllRanges();
    clearSelection();
  };

  return (
    <main
      ref={(element) => {
        setMain(element);
        onMain?.(element);
      }}
      {...stylex.props(styles.main)}
    >
      <article
        onClick={(event) => {
          const id = threadAtPoint(anchors, event.clientX, event.clientY);
          setActiveId(id);
          if (id) setSnap(raiseSheet);
        }}
      >
        {history?.content}
        <div hidden={Boolean(history)}>{children}</div>
      </article>
      {selection && !draft && !history ? (
        <PhoneEditMenu
          {...editMenuPosition(
            selection,
            { left: 8, right: (main?.clientWidth ?? 0) - 8 },
            EDIT_MENU_WIDTH,
            EDIT_MENU_HEIGHT,
            {
              top: main?.getBoundingClientRect().top ?? 0,
              height: window.innerHeight,
              reserved: sheetHeight(snap, window.innerHeight - TOP_BAR),
            },
          )}
          canComment={canComment}
          canEdit={canEdit}
          onComment={() => {
            setDraft(selection);
            setSnap(SHEET_HALF);
            done();
          }}
          onEdit={() => {
            onEdit(selection);
            clearSelection();
          }}
        />
      ) : null}
      <div hidden={Boolean(history)} {...stylex.props(styles.dock)}>
        <PhoneSheet
          actions={actions}
          activeId={activeId}
          agent={agent}
          draft={draft}
          offline={offline}
          snap={snap}
          threads={threads}
          onCancelDraft={() => setDraft(null)}
          onCreate={onCreate}
          onSnap={setSnap}
        />
      </div>
    </main>
  );
}
