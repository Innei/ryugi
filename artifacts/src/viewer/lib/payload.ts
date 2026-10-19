import type { CanvasPayload } from '../../shared/types';

export interface ViewerPayload extends CanvasPayload {
  contentBase: string;
  stale: boolean;
}

export function mergePayload(prev: ViewerPayload, next: Omit<ViewerPayload, 'stale'> & { stale?: boolean }): ViewerPayload {
  if (next.canvas === null && prev.canvas !== null) {
    return { ...prev, warnings: next.warnings, contentBase: next.contentBase || prev.contentBase, stale: true };
  }
  return { ...next, stale: false };
}
