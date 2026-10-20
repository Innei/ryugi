export const INSPECTOR_PROPERTIES = [
  'width', 'height', 'position', 'flex-grow', 'display', 'flex-direction', 'align-items',
  'gap', 'padding', 'background-color', 'opacity', 'border-radius', 'border-style',
  'font-size', 'color', 'box-shadow',
] as const;

export type InspectorProperty = (typeof INSPECTOR_PROPERTIES)[number];
export type LayerKind = 'Frame' | 'Column' | 'Row' | 'Grid' | 'Title' | 'Text' | 'Image' | 'Button';
export interface InspectorRect { x: number; y: number; width: number; height: number }
export interface InspectorTarget { id: number; name: string; rect: InspectorRect }
export interface InspectorNode {
  id: number;
  parentId: number | null;
  children: number[];
  tag: string;
  name: string;
  kind: LayerKind;
  selector: string;
  path: string;
}
export interface InspectorDetail { id: number; text: string; html: string }
export interface InspectorSelection extends Omit<InspectorNode, 'parentId' | 'children' | 'kind' | 'path'> {
  rect: InspectorRect;
  css: Record<InspectorProperty, string>;
  html: string;
  widthMode: 'fixed' | 'fill' | 'hug';
  heightMode: 'fixed' | 'hug';
}
export interface InspectorTweak { id: number; name: string; property: InspectorProperty; from: string; value: string }
export type InspectorCommand = { type: 'ryugi:inspect'; connection: string; session?: string } & (
  | { action: 'enable' | 'disable' | 'reset' | 'cancel-drag' }
  | { action: 'select'; id: number | null; primary?: boolean; toggle?: boolean }
  | { action: 'hover'; id: number | null }
  | { action: 'track'; ids: number[] }
  | { action: 'leaves'; request: number }
  | { action: 'describe'; request: number; ids: number[] }
  | { action: 'style'; id: number; property: InspectorProperty; value: string; session: string }
);
export type InspectorReport = { session: string; connection: string } & (
  | { type: 'ryugi:inspect:tree'; nodes: InspectorNode[]; truncated: boolean }
  | { type: 'ryugi:inspect:selection'; selection: InspectorSelection | null; reason: 'user' | 'command' | 'update' | 'primary'; toggle?: boolean }
  | { type: 'ryugi:inspect:targets'; request: number; targets: InspectorTarget[] }
  | { type: 'ryugi:inspect:details'; request: number; nodes: InspectorDetail[] }
  | { type: 'ryugi:inspect:drag'; phase: 'start' | 'move' | 'end' | 'cancel'; x: number; y: number; append: boolean; id?: number }
  | { type: 'ryugi:inspect:hover'; rect: InspectorRect | null; id?: number | null }
  | { type: 'ryugi:inspect:rect'; id: number; rect: InspectorRect }
  | { type: 'ryugi:inspect:tweaks'; tweaks: InspectorTweak[] }
  | { type: 'ryugi:inspect:wheel'; deltaX: number; deltaY: number; x: number; y: number; zoom: boolean }
  | { type: 'ryugi:inspect:pan'; deltaX: number; deltaY: number }
  | { type: 'ryugi:inspect:key'; code: string; key: string; down: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
);
