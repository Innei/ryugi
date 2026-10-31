export const INSPECTOR_PROPERTIES = [
  'width',
  'height',
  'position',
  'flex-grow',
  'display',
  'flex-direction',
  'align-items',
  'gap',
  'padding',
  'background-color',
  'opacity',
  'border-radius',
  'border-style',
  'font-size',
  'color',
  'box-shadow',
] as const;

export type InspectorProperty = (typeof INSPECTOR_PROPERTIES)[number];
export type LayerKind = 'Frame' | 'Column' | 'Row' | 'Grid' | 'Title' | 'Text' | 'Image' | 'Button';
export interface InspectorRect {
  height: number;
  width: number;
  x: number;
  y: number;
}
export interface InspectorTarget {
  id: number;
  name: string;
  rect: InspectorRect;
}
export interface InspectorNode {
  children: number[];
  id: number;
  kind: LayerKind;
  name: string;
  parentId: number | null;
  path: string;
  selector: string;
  tag: string;
}
export interface InspectorDetail {
  html: string;
  id: number;
  text: string;
}
export interface InspectorSelection extends Omit<
  InspectorNode,
  'parentId' | 'children' | 'kind' | 'path'
> {
  css: Record<InspectorProperty, string>;
  heightMode: 'fixed' | 'hug';
  html: string;
  rect: InspectorRect;
  widthMode: 'fixed' | 'fill' | 'hug';
}
export interface InspectorTweak {
  from: string;
  id: number;
  name: string;
  property: InspectorProperty;
  value: string;
}
export type InspectorCommand = { type: 'ryugi:inspect'; connection: string; session?: string } & (
  | { action: 'enable' | 'disable' | 'reset' | 'cancel-drag' }
  | { action: 'mode'; mode: 'select' | 'comment' }
  | { action: 'select'; id: number | null; primary?: boolean; toggle?: boolean }
  | { action: 'hover'; id: number | null }
  | { action: 'track'; ids: number[] }
  | { action: 'leaves'; request: number }
  | { action: 'describe'; request: number; ids: number[] }
  | { action: 'style'; id: number; property: InspectorProperty; value: string; session: string }
);
export type InspectorReport = { session: string; connection: string } & (
  | { type: 'ryugi:inspect:tree'; nodes: InspectorNode[]; truncated: boolean }
  | {
      type: 'ryugi:inspect:selection';
      selection: InspectorSelection | null;
      reason: 'user' | 'command' | 'update' | 'primary';
      toggle?: boolean;
    }
  | { type: 'ryugi:inspect:targets'; request: number; targets: InspectorTarget[] }
  | { type: 'ryugi:inspect:details'; request: number; nodes: InspectorDetail[] }
  | {
      type: 'ryugi:inspect:drag';
      phase: 'start' | 'move' | 'end' | 'cancel';
      x: number;
      y: number;
      append: boolean;
      id?: number;
    }
  | { type: 'ryugi:inspect:hover'; rect: InspectorRect | null; id?: number | null }
  | { type: 'ryugi:inspect:rect'; id: number; rect: InspectorRect }
  | { type: 'ryugi:inspect:tweaks'; tweaks: InspectorTweak[] }
  | {
      type: 'ryugi:inspect:wheel';
      deltaX: number;
      deltaY: number;
      x: number;
      y: number;
      zoom: boolean;
    }
  | { type: 'ryugi:inspect:pan'; deltaX: number; deltaY: number }
  | {
      type: 'ryugi:inspect:key';
      code: string;
      key: string;
      down: boolean;
      ctrlKey: boolean;
      metaKey: boolean;
      shiftKey: boolean;
      altKey: boolean;
    }
);

export const CURSOR_BLUE = '#0D99FF';
export const CURSOR_ARROW =
  'M6.2 3.6C5 2.7 3.4 3.6 3.6 5.1L6 22.7C6.2 24.3 8.2 24.8 9.1 23.5L13 18.3C13.4 17.8 14 17.5 14.6 17.5L21.1 17.3C22.7 17.2 23.4 15.2 22.2 14.3Z';
const COMMENT_PIN = 'M13 3a9 9 0 0 1 0 18H4.5A1.5 1.5 0 0 1 3 19.5V13A10 10 0 0 1 13 3z';

const svgCursor = (svg: string, hotspot: string, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot}, ${fallback}`;

export const POINTER_CURSOR = svgCursor(
  `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 28 28'><path d='${CURSOR_ARROW}' fill='none' stroke='white' stroke-width='4' stroke-linejoin='round'/><path d='${CURSOR_ARROW}' fill='${CURSOR_BLUE}'/></svg>`,
  '3 3',
  'default',
);
export const COMMENT_CURSOR = svgCursor(
  `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='${COMMENT_PIN}' fill='none' stroke='white' stroke-width='3' stroke-linejoin='round'/><path d='${COMMENT_PIN}' fill='${CURSOR_BLUE}'/><path d='M13 8.2v7.6M9.2 12h7.6' stroke='white' stroke-width='2.2' stroke-linecap='round'/></svg>`,
  '3 21',
  'crosshair',
);
