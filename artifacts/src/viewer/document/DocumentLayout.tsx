import * as stylex from '@stylexjs/stylex';
import type { LexicalEditor } from 'lexical';
import { type ReactNode, useState } from 'react';

import type { Thread } from '../../shared/comments';
import { useMedia } from '../hooks/useMedia';
import { BlockBars } from './BlockBars';
import type { ThreadActions } from './CommentCard';
import { CommentRail } from './CommentRail';
import type { DocumentHistoryView } from './DocumentHistory';
import { DocumentToc } from './DocumentToc';
import { threadAtPoint, useAnchors, useHighlights } from './useAnchors';

const styles = stylex.create({
  main: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '220px minmax(0, 700px) 320px',
    justifyContent: 'center',
    columnGap: 48,
    paddingBlock: 40,
    paddingInline: 24,
  },
  mainNoToc: { gridTemplateColumns: 'minmax(0, 700px) 320px' },
  mainNarrow: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingInline: 20,
  },
  railWrap: { position: 'relative' },
  column: { position: 'relative', width: '100%', maxWidth: 700, minWidth: 0 },
});

interface Props {
  actions?: ThreadActions;
  agent?: string;
  children: ReactNode;
  editor: LexicalEditor | null;
  history?: DocumentHistoryView | null;
  onMain?: (element: HTMLElement | null) => void;
  overlay?: (article: HTMLElement) => ReactNode;
  threads: Thread[];
}

export function DocumentLayout({
  editor,
  threads,
  actions,
  agent,
  onMain,
  overlay,
  history,
  children,
}: Props) {
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [articleEl, setArticleEl] = useState<HTMLElement | null>(null);
  const narrow = useMedia('(max-width: 1100px)');
  const withToc = !useMedia('(max-width: 1480px)');
  const anchors = useAnchors(editor, threads, rail);
  useHighlights(anchors, threads, activeId);

  return (
    <main
      ref={onMain}
      {...stylex.props(styles.main, !withToc && styles.mainNoToc, narrow && styles.mainNarrow)}
    >
      {withToc && !narrow ? <DocumentToc editor={editor} /> : null}
      <article
        ref={setArticleEl}
        {...stylex.props(styles.column)}
        style={narrow ? { marginInline: 'auto' } : undefined}
        onClick={(event) => setActiveId(threadAtPoint(anchors, event.clientX, event.clientY))}
      >
        {history?.content}
        <div hidden={Boolean(history)}>{children}</div>
        {history ? null : (
          <BlockBars
            activeId={activeId}
            anchors={anchors}
            container={articleEl}
            threads={threads}
          />
        )}
      </article>
      <div {...stylex.props(styles.railWrap)}>
        {history ? (
          history.panel
        ) : (
          <CommentRail
            actions={actions}
            activeId={activeId}
            agent={agent}
            anchors={anchors}
            narrow={narrow}
            railRef={setRail}
            threads={threads}
            onActivate={setActiveId}
          />
        )}
      </div>
      {articleEl && overlay && !history ? overlay(articleEl) : null}
    </main>
  );
}
