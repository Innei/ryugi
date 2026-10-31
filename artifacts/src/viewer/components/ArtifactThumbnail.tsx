import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';

import type { ArtifactType } from '../../shared/types';
import { TypeIcon } from './TypeIcon';

const styles = stylex.create({
  thumbnail: {
    position: 'relative',
    height: 140,
    boxSizing: 'border-box',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cssVar.colorFillQuaternary,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: cssVar.colorBorderSecondary,
    color: cssVar.colorTextTertiary,
    pointerEvents: 'none',
  },
  image: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
});

export function ArtifactThumbnail({ src, type }: { src?: string | null; type: ArtifactType }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div data-library-thumbnail aria-hidden="true" {...stylex.props(styles.thumbnail)}>
      <TypeIcon size={24} type={type} />
      {src && failed !== src && (
        <img
          alt=""
          decoding="async"
          height={360}
          key={src}
          loading="lazy"
          referrerPolicy="no-referrer"
          src={src}
          width={600}
          {...stylex.props(styles.image)}
          onError={() => setFailed(src)}
        />
      )}
    </div>
  );
}
