import { computeDiff, decorateSubtree, diffMergedNode } from '@haklex/rich-diff-core';
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

export interface HistoryDiffBlock { kind: 'equal' | 'insert' | 'delete' | 'modify'; value: SerializedEditorState; before?: SerializedEditorState }
type Node = SerializedLexicalNode & { children?: Node[]; text?: string; $?: Record<string, unknown>; [key: string]: unknown };

function normalize(value: SerializedLexicalNode): Node {
  const node = { ...value } as Node;
  if (node.$) {
    const { blockId: _id, ...state } = node.$;
    if (Object.keys(state).length) node.$ = state;
    else delete node.$;
  }
  if (node.children) node.children = node.children.map(normalize);
  return node;
}

function attributesChanged(before: Node, after: Node): boolean {
  const { children: oldChildren, text: _oldText, ...oldProps } = before;
  const { children: newChildren, text: _newText, ...newProps } = after;
  if (JSON.stringify(oldProps) !== JSON.stringify(newProps)) return true;
  return Boolean(oldChildren && newChildren && align(oldChildren, newChildren).some((part) => part.kind === 'modify' && attributesChanged(part.old[0]!, part.current[0]!)));
}

function inert(value: SerializedLexicalNode): SerializedLexicalNode {
  const node = value as Node;
  if (node.type === 'dynamic' || node.type === 'pending') {
    const text = node.type === 'dynamic' ? `动态内容（历史中不运行）\n${node.url}\n高度：${node.initialHeight ?? 320}px\n${JSON.stringify(node.props ?? {})}` : `待完成：${node.intent ?? ''}`;
    return { type: 'paragraph', version: 1, direction: null, format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }] } as SerializedLexicalNode;
  }
  return node.children ? { ...node, children: node.children.map(inert) } as SerializedLexicalNode : node;
}

function documentOf(nodes: SerializedLexicalNode[]): SerializedEditorState {
  return wrap(nodes.map(inert));
}

function wrap(nodes: SerializedLexicalNode[]): SerializedEditorState {
  return { root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: nodes } };
}

function align(oldNodes: Node[], newNodes: Node[]) {
  const hunks = computeDiff(wrap(oldNodes), wrap(newNodes));
  const parts: { kind: HistoryDiffBlock['kind']; old: Node[]; current: Node[] }[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  for (let index = 0; index < hunks.length; index++) {
    const hunk = hunks[index]!;
    if (hunk.type === 'equal') {
      parts.push({ kind: 'equal', old: oldNodes.slice(oldIndex, oldIndex + hunk.nodes.length), current: newNodes.slice(newIndex, newIndex + hunk.nodes.length) });
      oldIndex += hunk.nodes.length; newIndex += hunk.nodes.length;
      continue;
    }
    let deleted = 0; let inserted = 0;
    while (index < hunks.length && hunks[index]!.type !== 'equal') {
      const change = hunks[index++]!;
      if (change.type === 'delete') deleted += change.nodes.length;
      else inserted += change.nodes.length;
    }
    index--;
    for (let offset = 0; offset < Math.max(deleted, inserted); offset++) {
      const old = offset < deleted ? [oldNodes[oldIndex + offset]!] : [];
      const current = offset < inserted ? [newNodes[newIndex + offset]!] : [];
      parts.push({ kind: old.length && current.length ? 'modify' : old.length ? 'delete' : 'insert', old, current });
    }
    oldIndex += deleted; newIndex += inserted;
  }
  return parts;
}

export function historyDiff(before: SerializedEditorState, after: SerializedEditorState): HistoryDiffBlock[] {
  return align(before.root.children.map(normalize), after.root.children.map(normalize)).map((part) => {
    if (part.kind === 'modify') {
      const old = part.old[0]!; const current = part.current[0]!;
      return old.type === current.type && !attributesChanged(old, current)
        ? { kind: 'modify', value: documentOf([diffMergedNode(old, current)]) }
        : { kind: 'modify', before: documentOf(part.old), value: documentOf(part.current) };
    }
    const nodes = part.kind === 'delete' ? part.old : part.current;
    return { kind: part.kind, value: documentOf(part.kind === 'equal' ? nodes : nodes.map((node) => decorateSubtree(node, part.kind as 'insert' | 'delete'))) };
  });
}
