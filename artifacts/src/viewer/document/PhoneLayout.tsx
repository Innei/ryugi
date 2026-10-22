import * as stylex from '@stylexjs/stylex';
import { sheetHeight } from '../components/BottomSheet';
import type { LexicalEditor } from 'lexical';
import { useState, type ReactNode } from 'react';
import type { Thread } from '../../shared/comments';
import type { ThreadActions } from './CommentCard';
import { editMenuPosition } from './layoutCards';
import { EDIT_MENU_HEIGHT, EDIT_MENU_WIDTH, PhoneEditMenu } from './PhoneEditMenu';
import { PhoneSheet, raiseSheet, SHEET_HALF, SHEET_PEEK } from './PhoneSheet';
import { threadAtPoint, useAnchors, useDraftHighlight, useHighlights } from './useAnchors';
import type { SelectionTarget } from './useSelectionComment';

const TOP_BAR = 52;

const styles = stylex.create({
  main: { position: 'relative', paddingTop: 20, paddingInline: 20, paddingBottom: 120 },
  dock: { position: 'fixed', top: TOP_BAR, left: 0, right: 0, bottom: 0, zIndex: 20, pointerEvents: 'none' },
});

interface Props {
  editor: LexicalEditor | null;
  threads: Thread[];
  actions?: ThreadActions;
  agent?: string;
  canComment: boolean;
  canEdit: boolean;
  offline: boolean;
  selection: SelectionTarget | null;
  clearSelection: () => void;
  onCreate: (target: SelectionTarget, text: string) => Promise<boolean>;
  onEdit: (target: SelectionTarget) => void;
  onMain?: (element: HTMLElement | null) => void;
  children: ReactNode;
}

export function PhoneLayout({ editor, threads, actions, agent, canComment, canEdit, offline, selection, clearSelection, onCreate, onEdit, onMain, children }: Props) {
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
        {children}
      </article>
      {selection && !draft ? (
        <PhoneEditMenu
          {...editMenuPosition(selection, { left: 8, right: (main?.clientWidth ?? 0) - 8 }, EDIT_MENU_WIDTH, EDIT_MENU_HEIGHT, {
            top: main?.getBoundingClientRect().top ?? 0,
            height: window.innerHeight,
            reserved: sheetHeight(snap, window.innerHeight - TOP_BAR),
          })}
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
      <div {...stylex.props(styles.dock)}>
        <PhoneSheet
          threads={threads}
          agent={agent}
          actions={actions}
          offline={offline}
          draft={draft}
          onCreate={onCreate}
          onCancelDraft={() => setDraft(null)}
          activeId={activeId}
          snap={snap}
          onSnap={setSnap}
        />
      </div>
    </main>
  );
}
