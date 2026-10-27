import { $getRoot, type EditorState, type LexicalEditor, type NodeKey } from 'lexical';
import { useEffect, useState } from 'react';

export interface PendingBlocks {
  count: number;
  firstKey: NodeKey | null;
}

const none: PendingBlocks = { count: 0, firstKey: null };

const read = (state: EditorState): PendingBlocks =>
  state.read(() => {
    const keys = $getRoot()
      .getChildren()
      .filter((node) => node.getType() === 'pending')
      .map((node) => node.getKey());
    return { count: keys.length, firstKey: keys[0] ?? null };
  });

export function usePendingBlocks(editor: LexicalEditor | null): PendingBlocks {
  const [blocks, setBlocks] = useState(none);
  useEffect(() => {
    if (!editor) {
      setBlocks(none);
      return;
    }
    const apply = (next: PendingBlocks) =>
      setBlocks((prev) =>
        prev.count === next.count && prev.firstKey === next.firstKey ? prev : next,
      );
    apply(read(editor.getEditorState()));
    return editor.registerUpdateListener(({ editorState }) => apply(read(editorState)));
  }, [editor]);
  return blocks;
}

export function useNow(ticking: boolean, intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [ticking, intervalMs]);
  return now;
}
