import { DYNAMIC_URL } from '../../shared/dynamic';

export const MIN_FRAME_HEIGHT = 80;
export const MAX_FRAME_HEIGHT = 2000;

export function dynamicFrameSrc(contentBase: string, url: string, version: number, props: Record<string, unknown>): string | null {
  if (!DYNAMIC_URL.test(url)) return null;
  const src = `${contentBase}${url}?v=${version}`;
  return Object.keys(props).length === 0 ? src : `${src}#ryugi-props=${encodeURIComponent(JSON.stringify(props))}`;
}

export function clampFrameHeight(height: number): number | null {
  if (!Number.isFinite(height)) return null;
  return Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(height)));
}
