import './history.css';

import type { CreateEditorArgs } from 'lexical';
import type { LoroDoc, TreeID } from 'loro-crdt';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { useMedia } from '../hooks/useMedia';
import {
  blockAuthors,
  type History,
  type HistoryEntry,
  type HistoryGroup,
  type HistoryState,
  readHistory,
  readHistoryState,
} from './history';
import { HistoryContent } from './HistoryContent';
import { historyDiff, type HistoryDiffBlock } from './historyDiff';
import { HistoryPanel, HistorySheet } from './HistoryPanel';

export interface DocumentHistoryOptions {
  doc: LoroDoc | null;
  nodes: CreateEditorArgs['nodes'];
  onClose: () => void;
  open: boolean;
  streaming: boolean;
  theme: 'light' | 'dark';
  title: string;
}
export interface DocumentHistoryView {
  content: ReactNode;
  panel: ReactNode;
}
export interface HistoryChange extends HistoryDiffBlock {
  author?: HistoryEntry;
  group?: HistoryGroup;
}
export interface HistorySession {
  doc: LoroDoc;
  history: History;
  latest: HistoryState;
}

export interface HistoryModel {
  blocks: HistoryChange[];
  changeIndex: number;
  close: () => void;
  count: number;
  error: string | null;
  loading: boolean;
  navigate: (direction: number) => void;
  onlyChanges: boolean;
  pending: boolean;
  refresh: () => void;
  select: (entry: HistoryEntry) => void;
  selected: HistoryEntry | null;
  session: HistorySession | null;
  showAll: () => void;
  streaming: boolean;
  toggleOnly: () => void;
}

const versionKey = (doc: LoroDoc) => JSON.stringify(doc.frontiers());
const idAt = (ids: TreeID[], index: number | undefined) =>
  index === undefined ? undefined : ids[index];

export function useDocumentHistory({
  doc,
  nodes,
  streaming,
  theme,
  title,
  open,
  onClose,
}: DocumentHistoryOptions): DocumentHistoryView | null {
  const [session, setSession] = useState<HistorySession | null>(null);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const selectedRef = useRef<HistoryEntry | null>(null);
  const snapshot = useRef<LoroDoc | null>(null);
  const generation = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [blocks, setBlocks] = useState<HistoryChange[]>([]);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [changeIndex, setChangeIndex] = useState(0);
  const [sheet, setSheet] = useState(false);
  const narrow = useMedia('(max-width: 1100px)');
  const body = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!doc) return;
    const token = ++generation.current;
    setLoading(true);
    setError(null);
    const frozen = doc.fork();
    try {
      const history = await readHistory(frozen);
      const latest = readHistoryState(frozen, frozen.frontiers(), nodes);
      if (generation.current !== token) {
        frozen.free();
        return;
      }
      const previous = snapshot.current;
      snapshot.current = frozen;
      const kept =
        selectedRef.current &&
        history.entries.find((entry) => entry.id === selectedRef.current!.id);
      const next = kept ?? history.groups[1]?.entries.at(-1) ?? history.entries[0] ?? null;
      selectedRef.current = next;
      setSelected(next);
      setSession({ doc: frozen, history, latest });
      setPending(versionKey(doc) !== versionKey(frozen));
      previous?.free();
    } catch (err) {
      frozen.free();
      if (generation.current === token) setError((err as Error).message);
    } finally {
      if (generation.current === token) setLoading(false);
    }
  }, [doc, nodes]);

  useEffect(() => {
    if (!open) return;
    return () => {
      generation.current++;
      snapshot.current?.free();
      snapshot.current = null;
      selectedRef.current = null;
      setSession(null);
      setSelected(null);
      setBlocks([]);
      setPending(false);
      setError(null);
      setLoading(true);
      setSheet(false);
      setOnlyChanges(false);
    };
  }, [open, doc]);
  useEffect(() => {
    if (open && !streaming && !snapshot.current) void load();
  }, [open, load, streaming]);
  useEffect(() => {
    if (!open || !doc) return;
    return doc.subscribe(() =>
      setPending(snapshot.current !== null && versionKey(doc) !== versionKey(snapshot.current)),
    );
  }, [doc, open]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (sheet) setSheet(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open, onClose, sheet]);
  useEffect(() => {
    if (!session || !selected) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      try {
        const before = readHistoryState(session.doc, selected.frontiers, nodes);
        const { entries, groups } = session.history;
        const authors = blockAuthors(session.doc, entries.slice(entries.indexOf(selected) + 1), [
          before,
          session.latest,
        ]);
        const groupOf = new Map(
          groups.flatMap((group) => group.entries.map((entry) => [entry, group] as const)),
        );
        const next = historyDiff(before.value, session.latest.value).map((block): HistoryChange => {
          if (block.kind === 'equal') return block;
          const author = [
            idAt(session.latest.ids, block.newIndex),
            idAt(before.ids, block.oldIndex),
          ]
            .map((id) => id && authors.get(id))
            .find(Boolean);
          return author ? { ...block, author, group: groupOf.get(author) } : block;
        });
        if (!cancelled) {
          setBlocks(next);
          setChangeIndex(0);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session, selected, nodes]);

  if (!open || !doc) return null;
  const count = blocks.filter((block) => block.kind !== 'equal').length;
  const model: HistoryModel = {
    session,
    selected,
    blocks,
    count,
    changeIndex,
    loading,
    error,
    pending,
    streaming,
    onlyChanges,
    select: (entry) => {
      selectedRef.current = entry;
      setSelected(entry);
      setSheet(false);
    },
    navigate: (direction) => {
      const next = Math.max(0, Math.min(count - 1, changeIndex + direction));
      setChangeIndex(next);
      const changes = body.current?.querySelectorAll<HTMLElement>('[data-history-change]');
      changes?.[next]?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    },
    toggleOnly: () => setOnlyChanges((value) => !value),
    showAll: () => setOnlyChanges(false),
    refresh: () => void load(),
    close: onClose,
  };
  return {
    content: (
      <>
        <HistoryContent
          bodyRef={body}
          model={model}
          narrow={narrow}
          theme={theme}
          title={title}
          onPick={() => setSheet(true)}
        />
        {narrow && sheet ? <HistorySheet model={model} onDismiss={() => setSheet(false)} /> : null}
      </>
    ),
    panel: narrow ? null : <HistoryPanel model={model} />,
  };
}
