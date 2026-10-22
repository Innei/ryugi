import { allHeadlessNodes } from '@haklex/rich-headless';
import { createHeadlessEditor } from '@lexical/headless';
import { DecoratorNode, type LexicalEditor, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical';

type SerializedPendingNode = Spread<{ intent: string }, SerializedLexicalNode>;

class PendingNode extends DecoratorNode<null> {
  __intent: string;

  static getType() {
    return 'pending';
  }

  static clone(node: PendingNode) {
    return new PendingNode(node.__intent, node.__key);
  }

  static importJSON(json: SerializedPendingNode) {
    return new PendingNode(json.intent).updateFromJSON(json);
  }

  constructor(intent = '', key?: NodeKey) {
    super(key);
    this.__intent = intent;
  }

  exportJSON(): SerializedPendingNode {
    return { ...super.exportJSON(), type: 'pending', version: 1, intent: this.__intent };
  }

  createDOM(): HTMLElement {
    throw new Error('headless');
  }

  updateDOM() {
    return false;
  }

  isInline() {
    return false;
  }

  decorate() {
    return null;
  }
}

export const createDocumentHeadlessEditor = (): LexicalEditor =>
  createHeadlessEditor({
    nodes: [...allHeadlessNodes, PendingNode],
    onError: (err) => {
      throw err;
    },
  });
