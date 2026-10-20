import * as stylex from '@stylexjs/stylex';
import type { LexicalEditor } from 'lexical';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Thread } from '../../shared/comments';
import { BlockBars } from './BlockBars';
import type { ThreadActions } from './CommentCard';
import { CommentRail } from './CommentRail';
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
  mainNarrow: { display: 'flex', flexDirection: 'column', alignItems: 'stretch', paddingInline: 20 },
  railWrap: { position: 'relative' },
  column: { position: 'relative', width: '100%', maxWidth: 700, minWidth: 0 },
});

export function useMedia(query: string) {
  const list = useMemo(() => window.matchMedia(query), [query]);
  const [matches, setMatches] = useState(list.matches);
  useEffect(() => {
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [list]);
  return matches;
}

interface Props {
  editor: LexicalEditor | null;
  threads: Thread[];
  actions?: ThreadActions;
  agent?: string;
  onMain?: (element: HTMLElement | null) => void;
  overlay?: (article: HTMLElement) => ReactNode;
  children: ReactNode;
}

export function DocumentLayout({ editor, threads, actions, agent, onMain, overlay, children }: Props) {
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [articleEl, setArticleEl] = useState<HTMLElement | null>(null);
  const narrow = useMedia('(max-width: 1100px)');
  const withToc = !useMedia('(max-width: 1480px)');
  const anchors = useAnchors(editor, threads, rail);
  useHighlights(anchors, threads, activeId);

  return (
    <main ref={onMain} {...stylex.props(styles.main, !withToc && styles.mainNoToc, narrow && styles.mainNarrow)}>
      {withToc && !narrow ? <DocumentToc editor={editor} /> : null}
      <article
        ref={setArticleEl}
        {...stylex.props(styles.column)}
        style={narrow ? { marginInline: 'auto' } : undefined}
        onClick={(event) => setActiveId(threadAtPoint(anchors, event.clientX, event.clientY))}
      >
        {children}
        <BlockBars container={articleEl} anchors={anchors} threads={threads} activeId={activeId} />
      </article>
      <div {...stylex.props(styles.railWrap)}>
        <CommentRail
          agent={agent}
          narrow={narrow}
          threads={threads}
          anchors={anchors}
          activeId={activeId}
          actions={actions}
          onActivate={setActiveId}
          railRef={setRail}
        />
      </div>
      {articleEl && overlay ? overlay(articleEl) : null}
    </main>
  );
}
