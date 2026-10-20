export const INSPECTOR_PROPERTIES = [
  'width', 'height', 'position', 'flex-grow', 'display', 'flex-direction', 'align-items',
  'gap', 'padding', 'background-color', 'opacity', 'border-radius', 'border-style',
  'font-size', 'color', 'box-shadow',
] as const;

export type InspectorProperty = (typeof INSPECTOR_PROPERTIES)[number];
export type LayerKind = 'Frame' | 'Column' | 'Row' | 'Grid' | 'Title' | 'Text' | 'Image' | 'Button';
export interface InspectorRect { x: number; y: number; width: number; height: number }
export interface InspectorNode {
  id: number;
  parentId: number | null;
  children: number[];
  tag: string;
  name: string;
  kind: LayerKind;
  selector: string;
}
export interface InspectorSelection extends Omit<InspectorNode, 'parentId' | 'children' | 'kind'> {
  rect: InspectorRect;
  css: Record<InspectorProperty, string>;
  html: string;
  widthMode: 'fixed' | 'fill' | 'hug';
  heightMode: 'fixed' | 'hug';
}
export interface InspectorTweak { id: number; name: string; property: InspectorProperty; value: string }
export type InspectorCommand = { type: 'ryugi:inspect'; connection: string; session?: string } & (
  | { action: 'enable' | 'disable' | 'reset' }
  | { action: 'select' | 'hover'; id: number | null }
  | { action: 'style'; id: number; property: InspectorProperty; value: string; session: string }
);
export type InspectorReport = { session: string; connection: string } & (
  | { type: 'ryugi:inspect:tree'; nodes: InspectorNode[]; truncated: boolean }
  | { type: 'ryugi:inspect:selection'; selection: InspectorSelection | null; reason: 'user' | 'command' | 'update' }
  | { type: 'ryugi:inspect:hover'; rect: InspectorRect | null }
  | { type: 'ryugi:inspect:tweaks'; tweaks: InspectorTweak[] }
  | { type: 'ryugi:inspect:wheel'; deltaX: number; deltaY: number; x: number; y: number; zoom: boolean }
  | { type: 'ryugi:inspect:pan'; deltaX: number; deltaY: number }
  | { type: 'ryugi:inspect:key'; code: string; key: string; down: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
);
