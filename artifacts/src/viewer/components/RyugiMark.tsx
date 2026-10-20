import { RYUGI_MARK_BODY, RYUGI_MARK_VIEWBOX } from '../../shared/brand';

export function RyugiMark({ size = 16, color }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={RYUGI_MARK_VIEWBOX}
      fill="currentColor"
      aria-hidden="true"
      style={{ flex: 'none', display: 'block', color }}
      dangerouslySetInnerHTML={{ __html: RYUGI_MARK_BODY }}
    />
  );
}
