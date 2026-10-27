import { RYUGI_MARK_BODY, RYUGI_MARK_VIEWBOX } from '../../shared/brand';

export function RyugiMark({ size = 16, color }: { size?: number; color?: string }) {
  return (
    <svg
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: RYUGI_MARK_BODY }}
      fill="currentColor"
      height={size}
      style={{ flex: 'none', display: 'block', color }}
      viewBox={RYUGI_MARK_VIEWBOX}
      width={size}
    />
  );
}
