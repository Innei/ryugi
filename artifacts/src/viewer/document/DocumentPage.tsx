import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import type { LexicalEditor } from 'lexical';
import { LoroDoc } from 'loro-crdt';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { emptyComments, type CommentsFile, type HumanOp } from '../../shared/comments';
import { WarningsBadge } from '../components/WarningsBadge';
import type { ThreadActions } from './CommentCard';
import { DocumentEditor } from './DocumentEditor';
import { DocumentLayout } from './DocumentLayout';
import { DynamicHostContext, type DynamicHost } from './DynamicBlock';
import { DRAFT_WIDTH, DraftPanel } from './DraftPanel';
import { popoverPosition, toolbarPosition } from './layoutCards';
import { SelectionToolbar, TOOLBAR_HEIGHT, TOOLBAR_WIDTH } from './SelectionToolbar';
import { decodeBase64 } from './LoroSync';
import type { DocumentMeta, DocumentTransport } from './transport';
import { TopBar } from './TopBar';
import { useDocumentSelectionSync } from './useDocumentSelectionSync';
import { useLocalTransport } from './useDocumentTransport';
import { useDraftComment } from './useDraftComment';
import { useSelectionComment } from './useSelectionComment';

const styles = stylex.create({
  root: { minHeight: '100%', backgroundColor: cssVar.colorBgContainer, color: cssVar.colorText },
  message: { padding: 48, textAlign: 'center', color: cssVar.colorTextSecondary, fontFamily: cssVar.fontFamily, fontSize: 14 },
});

function columnBounds(article: HTMLElement) {
  return { left: article.offsetLeft, right: Math.min(article.offsetLeft + article.offsetWidth, window.innerWidth - 16) };
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
  const { transport, live } = useLocalTransport(id);
  return <DocumentView id={id} transport={transport} live={live} />;
}

export function DocumentView({ id, transport, live }: { id: string; transport: DocumentTransport; live: boolean }) {
  const [meta, setMeta] = useState<DocumentMeta | null>(null);
  const [doc, setDoc] = useState<LoroDoc | null>(null);
  const [comments, setComments] = useState<CommentsFile>(emptyComments);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [editor, setEditor] = useState<LexicalEditor | null>(null);
  const [mainEl, setMainEl] = useState<HTMLElement | null>(null);
  const dark = usePrefersDark();
  const { artifact, channel } = transport;

  const refreshMeta = useCallback(async () => {
    const next = await transport.meta();
    if (next) setMeta(next);
  }, [transport]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refreshMeta();
        const state = await transport.state();
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
  }, [transport, refreshMeta]);

  useEffect(
    () =>
      channel.subscribe((event) => {
        if (event.type === 'change') void refreshMeta();
        else if (event.type === 'doc-status') setStreaming(event.streaming);
        else if (event.type === 'doc-comments') setComments(event.comments);
      }),
    [channel, refreshMeta],
  );

  useAssetBase(meta?.contentBase);
  useDocumentSelectionSync(editor, artifact, live, transport.send);
  const dynamicHost = useMemo<DynamicHost>(
    () => ({ artifact, contentBase: meta?.contentBase ?? '', channel, send: transport.send }),
    [artifact, meta?.contentBase, channel, transport],
  );
  useEffect(() => {
    document.title = meta?.title || id;
  }, [meta?.title, id]);

  const openComments = comments.threads.filter((thread) => thread.status === 'open').length;
  const [selection, clearSelection] = useSelectionComment(editor, mainEl);
  const composing = useDraftComment(clearSelection);
  const { draft } = composing;

  const send = useCallback(
    async (op: HumanOp) => {
      try {
        setComments(await transport.comment(op));
      } catch {}
    },
    [transport],
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
        agent={meta?.agent}
        agentEditing={streaming}
        agentSection={section}
        offline={offline}
        openComments={openComments}
      />
      <DocumentLayout
        editor={editor}
        threads={comments.threads}
        actions={actions}
        agent={meta?.agent}
        onMain={setMainEl}
        overlay={(articleEl) => (
          <>
            {selection && !draft ? (
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
                onSubmit={(text) => {
                  void send({ op: 'create', blockId: draft.target.blockId, quote: draft.target.quote, text });
                  composing.close(false);
                }}
                onCancel={() => composing.close(true)}
              />
            ) : null}
          </>
        )}
      >
        <DynamicHostContext.Provider value={dynamicHost}>
          <DocumentEditor
            transport={transport}
            agent={meta?.agent}
            doc={doc}
            theme={dark ? 'dark' : 'light'}
            onAgentSection={setSection}
            onOffline={setOffline}
            onEditorReady={setEditor}
          />
        </DynamicHostContext.Provider>
      </DocumentLayout>
      <WarningsBadge warnings={meta?.warnings ?? []} />
    </div>
  );
}
