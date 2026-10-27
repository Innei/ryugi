import { createLoroBinding, TREE_NAME } from '@haklex/rich-collab-loro';
import { createEditor, type CreateEditorArgs, type SerializedEditorState } from 'lexical';
import type { Change, LoroDoc, LoroTreeNode, OpId, TreeID } from 'loro-crdt';

import { i18n } from '../i18n';

export interface HistoryEntry {
  change: Change;
  frontiers: OpId[];
  id: string;
}
export interface HistoryGroup {
  entries: HistoryEntry[];
  id: string;
  source: 'human' | 'agent' | 'session' | 'unknown';
}
export interface History {
  entries: HistoryEntry[];
  groups: HistoryGroup[];
  shallow: boolean;
}
export interface HistoryState {
  ids: TreeID[];
  owners: Map<TreeID, TreeID>;
  value: SerializedEditorState;
}

export async function readHistory(doc: LoroDoc): Promise<History> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const changes = [...doc.getAllChanges().values()]
    .flat()
    .sort((a, b) => a.lamport - b.lamport || a.peer.localeCompare(b.peer) || a.counter - b.counter);
  const start = doc.shallowSinceFrontiers();
  const version = doc.frontiersToVV(start);
  const entries: HistoryEntry[] = [];
  const groups: HistoryGroup[] = [];
  try {
    for (const change of changes) {
      version.setLast({ peer: change.peer, counter: change.counter + change.length - 1 });
      const entry = {
        id: `${change.counter}@${change.peer}`,
        change,
        frontiers: doc.vvToFrontiers(version),
      };
      entries.push(entry);
      const source =
        change.message === 'human'
          ? 'human'
          : change.message?.startsWith('agent:')
            ? 'agent'
            : change.message?.startsWith('session ')
              ? 'session'
              : 'unknown';
      const last = groups.at(-1);
      const previous = last?.entries.at(-1)?.change;
      if (
        last &&
        previous &&
        source !== 'unknown' &&
        last.source === source &&
        previous.peer === change.peer &&
        previous.timestamp > 0 &&
        change.timestamp >= previous.timestamp &&
        change.timestamp - previous.timestamp <= 60
      ) {
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

export function readHistoryState(
  doc: LoroDoc,
  frontiers: OpId[],
  nodes: CreateEditorArgs['nodes'],
): HistoryState {
  // Loro forkAt does not support shallow snapshots.
  const fork = doc.fork();
  let binding: ReturnType<typeof createLoroBinding> | undefined;
  try {
    fork.checkout(frontiers);
    const roots = fork.getTree(TREE_NAME).roots();
    if (roots.length !== 1) throw new Error(i18n.t('history.contentUnavailable'));
    const editor = createEditor({
      nodes,
      editable: false,
      onError: (error) => {
        throw error;
      },
    });
    binding = createLoroBinding(editor, fork);
    const blocks = roots[0]!.children() ?? [];
    const owners = new Map<TreeID, TreeID>();
    const own = (node: LoroTreeNode, owner: TreeID) => {
      owners.set(node.id, owner);
      node.children()?.forEach((child) => own(child, owner));
    };
    blocks.forEach((block) => own(block, block.id));
    return {
      value: editor.getEditorState().toJSON(),
      ids: blocks.map((block) => block.id),
      owners,
    };
  } finally {
    binding?.dispose();
    fork.free();
  }
}

const TREE_NODE_DATA = /^cid:(\d+@\d+):Map$/;

export function blockAuthors(
  doc: LoroDoc,
  entries: HistoryEntry[],
  states: HistoryState[],
): Map<TreeID, HistoryEntry> {
  const owners = new Map(states.flatMap((state) => [...state.owners]));
  const tree = doc.getTree(TREE_NAME);
  const authors = new Map<TreeID, HistoryEntry>();
  const order = new Map(entries.map((entry, index) => [entry, index]));
  const credit = (block: TreeID, entry: HistoryEntry) => {
    const current = authors.get(block);
    if (!current || order.get(current)! < order.get(entry)!) authors.set(block, entry);
  };
  for (const entry of entries) {
    const { peer, counter, length } = entry.change;
    for (const id of doc.getChangedContainersIn({ peer, counter }, length)) {
      let container = doc.getContainerById(id);
      while (container) {
        const node = TREE_NODE_DATA.exec(container.id)?.[1] as TreeID | undefined;
        const owner = node && owners.get(node);
        if (owner) {
          credit(owner, entry);
          break;
        }
        container = container.parent();
      }
    }
  }
  const containing = (op: OpId | undefined) =>
    op &&
    entries.find(
      ({ change }) =>
        change.peer === op.peer &&
        change.counter <= op.counter &&
        op.counter < change.counter + change.length,
    );
  // The binding re-moves sibling blocks while it deletes one, so only a deletion's move is an edit.
  for (const block of new Set(owners.values())) {
    if (!tree.isNodeDeleted(block)) continue;
    const entry = containing(tree.getNodeByID(block)?.getLastMoveId());
    if (entry) credit(block, entry);
  }
  return authors;
}
