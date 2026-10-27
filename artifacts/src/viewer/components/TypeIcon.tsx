import { TYPE_GLYPHS, TYPE_ICON_VIEWBOX } from '../../shared/type-icons';
import type { ArtifactType } from '../../shared/types';

export function TypeIcon({ type, size = 16 }: { type: ArtifactType; size?: number }) {
  const { fill, stroke } = TYPE_GLYPHS[type];
  return (
    <svg
      width={size}
      height={size}
      viewBox={TYPE_ICON_VIEWBOX}
      aria-hidden="true"
      style={{ flex: 'none', display: 'block' }}
    >
      {fill && <path d={fill} fill="currentColor" />}
      <path
        d={stroke}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
