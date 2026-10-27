import { DecoratorNode, type NodeKey, type SerializedLexicalNode, type Spread } from 'lexical';
import type { ReactElement } from 'react';
import { DynamicBlock } from './DynamicBlock';

type SerializedDynamicNode = Spread<
  { url: string; props: Record<string, unknown>; initialHeight: number },
  SerializedLexicalNode
>;

// Replaces @haklex/rich-ext-dynamic's node, which import()s the component into the viewer's own origin; agent-written code must stay in the sandboxed iframe.
export class DynamicNode extends DecoratorNode<ReactElement> {
  __url: string;
  __props: Record<string, unknown>;
  __initialHeight: number;

  static getType() {
    return 'dynamic';
  }

  static clone(node: DynamicNode) {
    return new DynamicNode(node.__url, node.__props, node.__initialHeight, node.__key);
  }

  static importJSON(json: SerializedDynamicNode) {
    return new DynamicNode(json.url, json.props, json.initialHeight).updateFromJSON(json);
  }

  constructor(url = '', props: Record<string, unknown> = {}, initialHeight = 320, key?: NodeKey) {
    super(key);
    this.__url = url;
    this.__props = props;
    this.__initialHeight = initialHeight;
  }

  exportJSON(): SerializedDynamicNode {
    return {
      ...super.exportJSON(),
      type: 'dynamic',
      version: 1,
      url: this.__url,
      props: this.__props,
      initialHeight: this.__initialHeight,
    };
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
    return (
      <DynamicBlock
        url={this.__url}
        componentProps={this.__props}
        initialHeight={this.__initialHeight}
      />
    );
  }
}
