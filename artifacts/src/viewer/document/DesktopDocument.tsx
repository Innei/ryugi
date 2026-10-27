import type { LexicalEditor } from 'lexical';
import type { ReactNode } from 'react';
import type { Thread } from '../../shared/comments';
import type { ThreadActions } from './CommentCard';
import type { DocumentHistoryView } from './DocumentHistory';
import { DocumentLayout } from './DocumentLayout';
import { DRAFT_WIDTH, DraftPanel } from './DraftPanel';
import { popoverPosition, toolbarPosition } from './layoutCards';
import { SelectionToolbar, TOOLBAR_HEIGHT, TOOLBAR_WIDTH } from './SelectionToolbar';
import { useDraftComment } from './useDraftComment';
import type { SelectionTarget } from './useSelectionComment';

function columnBounds(article: HTMLElement) {
  return {
    left: article.offsetLeft,
    right: Math.min(article.offsetLeft + article.offsetWidth, window.innerWidth - 16),
  };
}

interface Props {
  editor: LexicalEditor | null;
  threads: Thread[];
  actions: ThreadActions;
  agent?: string;
  canComment: boolean;
  selection: SelectionTarget | null;
  clearSelection: () => void;
  onCreate: (target: SelectionTarget, text: string) => Promise<boolean>;
  onMain: (element: HTMLElement | null) => void;
  history?: DocumentHistoryView | null;
  children: ReactNode;
}

export function DesktopDocument({
  editor,
  threads,
  actions,
  agent,
  canComment,
  selection,
  clearSelection,
  onCreate,
  onMain,
  history,
  children,
}: Props) {
  const composing = useDraftComment(clearSelection);
  const { draft } = composing;
  return (
    <DocumentLayout
      editor={editor}
      threads={threads}
      actions={actions}
      agent={agent}
      onMain={onMain}
      history={history}
      overlay={(articleEl) => (
        <>
          {selection && !draft ? (
            <SelectionToolbar
              ref={composing.toolbarRef}
              {...toolbarPosition(
                selection,
                columnBounds(articleEl),
                TOOLBAR_WIDTH,
                TOOLBAR_HEIGHT,
                8,
              )}
              onComment={canComment ? () => composing.open(selection) : undefined}
              onCopy={() => {
                void navigator.clipboard?.writeText(selection.quote);
                window.getSelection()?.removeAllRanges();
                clearSelection();
              }}
            />
          ) : null}
          {draft ? (
            <DraftPanel
              ref={composing.panelRef}
              key={`${draft.target.blockId}:${draft.target.quote}`}
              {...popoverPosition(draft.target, columnBounds(articleEl), DRAFT_WIDTH, 8)}
              quote={draft.target.quote}
              initial={draft.initial}
              restored={composing.restored}
              leaving={composing.leaving}
              onChange={composing.onText}
              onSubmit={(text) =>
                onCreate(draft.target, text).then((ok) => {
                  if (ok) composing.close(false);
                  return ok;
                })
              }
              onCancel={() => composing.close(true)}
            />
          ) : null}
        </>
      )}
    >
      {children}
    </DocumentLayout>
  );
}
