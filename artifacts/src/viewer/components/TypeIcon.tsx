import { TYPE_GLYPHS, TYPE_ICON_VIEWBOX } from '../../shared/type-icons';
import type { ArtifactType } from '../../shared/types';

export function TypeIcon({ type, size = 16 }: { type: ArtifactType; size?: number }) {
  const { fill, stroke } = TYPE_GLYPHS[type];
  return (
    <svg
      aria-hidden="true"
      height={size}
      style={{ flex: 'none', display: 'block' }}
      viewBox={TYPE_ICON_VIEWBOX}
      width={size}
    >
      {fill && <path d={fill} fill="currentColor" />}
      <path
        d={stroke}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}
