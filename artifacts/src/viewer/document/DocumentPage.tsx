import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import type { LexicalEditor } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { emptyComments, type CommentsFile, type HumanOp } from '../../shared/comments';
import type { DocumentPayload } from '../../shared/types';
import { WarningsBadge } from '../components/WarningsBadge';
import { useArtifactSocket } from '../hooks/useArtifactSocket';
import { BlockBars } from './BlockBars';
import { createChannel } from './channel';
import type { ThreadActions } from './CommentCard';
import { CommentRail } from './CommentRail';
import { DocumentEditor } from './DocumentEditor';
import { DynamicHostContext, type DynamicHost } from './DynamicBlock';
import { DocumentToc } from './DocumentToc';
import { DRAFT_WIDTH, DraftPanel } from './DraftPanel';
import { popoverPosition, toolbarPosition } from './layoutCards';
import { SelectionToolbar, TOOLBAR_HEIGHT, TOOLBAR_WIDTH } from './SelectionToolbar';
import { decodeBase64 } from './LoroSync';
import { TopBar } from './TopBar';
import { threadAtPoint, useAnchors, useHighlights } from './useAnchors';
import { useDraftComment } from './useDraftComment';
import { useSelectionComment } from './useSelectionComment';

const styles = stylex.create({
  root: { minHeight: '100%', backgroundColor: cssVar.colorBgContainer, color: cssVar.colorText },
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
  message: { padding: 48, textAlign: 'center', color: cssVar.colorTextSecondary, fontFamily: cssVar.fontFamily, fontSize: 14 },
});

interface Meta extends DocumentPayload {
  contentBase: string;
}

function columnBounds(article: HTMLElement) {
  return { left: article.offsetLeft, right: Math.min(article.offsetLeft + article.offsetWidth, window.innerWidth - 16) };
}

function useMedia(query: string) {
  const list = useMemo(() => window.matchMedia(query), [query]);
  const [matches, setMatches] = useState(list.matches);
  useEffect(() => {
    const onChange = () => setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [list]);
  return matches;
}

function usePrefersDark() {
  const query = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), []);
  const [dark, setDark] = useState(query.matches);
  useEffect(() => {
    const onChange = () => setDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [query]);
  return dark;
}

function useAssetBase(contentBase: string | undefined) {
  useEffect(() => {
    if (!contentBase) return;
    const base = document.createElement('base');
    base.href = contentBase;
    document.head.prepend(base);
    return () => base.remove();
  }, [contentBase]);
}

export default function DocumentPage({ id }: { id: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [doc, setDoc] = useState<LoroDoc | null>(null);
  const [comments, setComments] = useState<CommentsFile>(emptyComments);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [editor, setEditor] = useState<LexicalEditor | null>(null);
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  const [articleEl, setArticleEl] = useState<HTMLElement | null>(null);
  const narrow = useMedia('(max-width: 1100px)');
  const withToc = !useMedia('(max-width: 1480px)');
  const channel = useMemo(createChannel, []);
  const dark = usePrefersDark();
  const artifact = `document/${id}`;

  const refreshMeta = useCallback(async () => {
    const res = await fetch(`/api/artifacts/document/${id}`, { cache: 'no-store' });
    if (res.ok) setMeta((await res.json()) as Meta);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refreshMeta();
        const res = await fetch(`/api/document/${id}/state`, { cache: 'no-store' });
        const state = (await res.json()) as { snapshot?: string; streaming?: boolean; comments?: CommentsFile; error?: string };
        if (!res.ok || !state.snapshot) throw new Error(state.error ?? `load failed (${res.status})`);
        if (cancelled) return;
        const loro = new LoroDoc();
        loro.setRecordTimestamp(true);
        loro.setChangeMergeInterval(20);
        loro.import(decodeBase64(state.snapshot));
        setStreaming(Boolean(state.streaming));
        setComments(state.comments ?? emptyComments());
        setDoc(loro);
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, refreshMeta]);

  const { send: sendSocket } = useArtifactSocket(
    (message) => {
      if (message.artifact !== artifact) return;
      if (message.type === 'change') void refreshMeta();
      else if (message.type === 'doc-status') setStreaming(message.streaming);
      else if (message.type === 'doc-comments') setComments(message.comments);
      channel.emit(message);
    },
    () => channel.emit({ type: 'open' }),
  );

  useAssetBase(meta?.contentBase);
  const dynamicHost = useMemo<DynamicHost>(
    () => ({ artifact, contentBase: meta?.contentBase ?? '', channel, send: sendSocket }),
    [artifact, meta?.contentBase, channel, sendSocket],
  );
  useEffect(() => {
    document.title = meta?.title || id;
  }, [meta?.title, id]);

  const openComments = comments.threads.filter((thread) => thread.status === 'open').length;
  const anchors = useAnchors(editor, comments.threads, rail);
  useHighlights(anchors, comments.threads, activeId);
  const [selection, clearSelection] = useSelectionComment(editor, mainEl);
  const composing = useDraftComment(clearSelection);
  const { draft } = composing;

  const send = useCallback(
    async (op: HumanOp) => {
      const res = await fetch(`/api/document/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op),
      });
      if (res.ok) setComments(((await res.json()) as { comments: CommentsFile }).comments);
    },
    [id],
  );
  const actions = useMemo<ThreadActions>(
    () => ({
      reply: (threadId, text) => void send({ op: 'reply', threadId, text }),
      edit: (threadId, messageId, text) => void send({ op: 'edit', threadId, messageId, text }),
      remove: (threadId, messageId) => void send({ op: 'delete', threadId, messageId }),
      resolve: (threadId) => void send({ op: 'resolve', threadId }),
      reopen: (threadId) => void send({ op: 'reopen', threadId }),
    }),
    [send],
  );

  if (loadError) return <div {...stylex.props(styles.message)}>{loadError}</div>;
  if (!doc) return <div {...stylex.props(styles.message)}>Loading…</div>;

  return (
    <div {...stylex.props(styles.root)} className={`ryugi-doc ${stylex.props(styles.root).className ?? ''}`}>
      <TopBar
        id={id}
        agentEditing={streaming}
        agentSection={section}
        offline={offline}
        openComments={openComments}
      />
      <main ref={setMainEl} {...stylex.props(styles.main, !withToc && styles.mainNoToc, narrow && styles.mainNarrow)}>
        {withToc && !narrow ? <DocumentToc editor={editor} /> : null}
        <article
          ref={setArticleEl}
          {...stylex.props(styles.column)}
          style={narrow ? { marginInline: 'auto' } : undefined}
          onClick={(event) => setActiveId(threadAtPoint(anchors, event.clientX, event.clientY))}
        >
          <DynamicHostContext.Provider value={dynamicHost}>
            <DocumentEditor
              id={id}
              doc={doc}
              channel={channel}
              theme={dark ? 'dark' : 'light'}
              onAgentSection={setSection}
              onOffline={setOffline}
              onEditorReady={setEditor}
            />
          </DynamicHostContext.Provider>
          <BlockBars container={articleEl} anchors={anchors} threads={comments.threads} activeId={activeId} />
        </article>
        <div {...stylex.props(styles.railWrap)}>
          <CommentRail
            narrow={narrow}
            threads={comments.threads}
            anchors={anchors}
            activeId={activeId}
            actions={actions}
            onActivate={setActiveId}
            railRef={setRail}
          />
        </div>
        {selection && !draft && articleEl ? (
          <SelectionToolbar
            ref={composing.toolbarRef}
            {...toolbarPosition(selection, columnBounds(articleEl), TOOLBAR_WIDTH, TOOLBAR_HEIGHT, 8)}
            onComment={() => composing.open(selection)}
            onCopy={() => {
              void navigator.clipboard?.writeText(selection.quote);
              window.getSelection()?.removeAllRanges();
              clearSelection();
            }}
          />
        ) : null}
        {draft && articleEl ? (
          <DraftPanel
            ref={composing.panelRef}
            key={`${draft.target.blockId}:${draft.target.quote}`}
            {...popoverPosition(draft.target, columnBounds(articleEl), DRAFT_WIDTH, 8)}
            quote={draft.target.quote}
            initial={draft.initial}
            restored={composing.restored}
            leaving={composing.leaving}
            onChange={composing.onText}
            onSubmit={(text) => {
              void send({ op: 'create', blockId: draft.target.blockId, quote: draft.target.quote, text });
              composing.close(false);
            }}
            onCancel={() => composing.close(true)}
          />
        ) : null}
      </main>
      <WarningsBadge warnings={meta?.warnings ?? []} />
    </div>
  );
}
