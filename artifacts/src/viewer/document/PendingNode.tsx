import {
  $applyNodeReplacement,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import type { ReactElement } from 'react';
import { PendingBlock } from './PendingBlock';

type SerializedPendingNode = Spread<{ intent: string }, SerializedLexicalNode>;

export class PendingNode extends DecoratorNode<ReactElement> {
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

  createDOM() {
    return document.createElement('div');
  }

  updateDOM() {
    return false;
  }

  isInline() {
    return false;
  }

  decorate() {
    return <PendingBlock nodeKey={this.getKey()} intent={this.__intent} />;
  }
}

export const $createPendingNode = (intent: string) =>
  $applyNodeReplacement(new PendingNode(intent));
