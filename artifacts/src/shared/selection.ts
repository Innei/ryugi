import type { InspectorProperty } from './inspector';

export const SELECTION_FULL_NODES = 20;
export const SELECTION_MAX_NODES = 25000;
export const SELECTION_MAX_BYTES = 4 * 1024 * 1024;
export const SELECTION_LIMITS = { id: 200, board: 100, file: 500, tag: 80, path: 4000, name: 100, text: 200, html: 2000, from: 2000, value: 300 };

export interface SelectionChange { property: InspectorProperty; from: string; value: string }
export interface SelectionNode { id: string; board: string; file: string; tag: string; path: string; name: string }
export interface SelectedNode extends SelectionNode { text: string; html: string; tweaks: SelectionChange[] }
export interface SelectionTweak extends SelectionNode, SelectionChange {}

export interface SelectionState {
  selected: SelectedNode[];
  more: number;
  tweaks: SelectionTweak[];
  nodes: SelectionNode[];
}

export interface SelectionMessage extends SelectionState {
  type: 'selection';
  artifact: string;
  tab: string;
  human: boolean;
}

export interface SelectionFile extends SelectionState {
  artifact: string;
  updatedAt: string;
}
