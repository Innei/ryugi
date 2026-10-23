import { createLoroBinding, TREE_NAME } from '@haklex/rich-collab-loro';
import { createEditor, type CreateEditorArgs, type SerializedEditorState } from 'lexical';
import type { Change, LoroDoc, OpId } from 'loro-crdt';

export interface HistoryEntry { id: string; change: Change; frontiers: OpId[] }
export interface HistoryGroup { id: string; source: 'human' | 'agent' | 'session' | 'unknown'; entries: HistoryEntry[] }
export interface History { entries: HistoryEntry[]; groups: HistoryGroup[]; shallow: boolean }

export async function readHistory(doc: LoroDoc): Promise<History> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const changes = [...doc.getAllChanges().values()].flat().sort((a, b) => a.lamport - b.lamport || a.peer.localeCompare(b.peer) || a.counter - b.counter);
  const start = doc.shallowSinceFrontiers();
  const version = doc.frontiersToVV(start);
  const entries: HistoryEntry[] = [];
  const groups: HistoryGroup[] = [];
  try {
    for (const change of changes) {
      version.setLast({ peer: change.peer, counter: change.counter + change.length - 1 });
      const entry = { id: `${change.counter}@${change.peer}`, change, frontiers: doc.vvToFrontiers(version) };
      entries.push(entry);
      const source = change.message === 'human' ? 'human' : change.message?.startsWith('agent:') ? 'agent' : change.message?.startsWith('session ') ? 'session' : 'unknown';
      const last = groups.at(-1);
      const previous = last?.entries.at(-1)?.change;
      if (last && previous && source !== 'unknown' && last.source === source && previous.peer === change.peer && previous.timestamp > 0 && change.timestamp >= previous.timestamp && change.timestamp - previous.timestamp <= 60) {
        last.entries.push(entry);
        last.id = entry.id;
      } else {
        groups.push({ id: entry.id, source, entries: [entry] });
      }
      if (entries.length % 200 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    version.free();
  }
  return { entries, groups: groups.reverse(), shallow: start.length > 0 };
}

export function readHistoryState(doc: LoroDoc, frontiers: OpId[], nodes: CreateEditorArgs['nodes']): SerializedEditorState {
  // Loro forkAt does not support shallow snapshots.
  const fork = doc.fork();
  let binding: ReturnType<typeof createLoroBinding> | undefined;
  try {
    fork.checkout(frontiers);
    if (fork.getTree(TREE_NAME).roots().length !== 1) throw new Error('此版本的文档内容不可用');
    const editor = createEditor({ nodes, editable: false, onError: (error) => { throw error; } });
    binding = createLoroBinding(editor, fork);
    return editor.getEditorState().toJSON();
  } finally {
    binding?.dispose();
    fork.free();
  }
}
