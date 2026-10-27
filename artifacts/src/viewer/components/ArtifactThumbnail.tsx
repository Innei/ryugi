import './thumbnail.css';

import { useState } from 'react';

import type { ArtifactType } from '../../shared/types';
import { TypeIcon } from './TypeIcon';

export function ArtifactThumbnail({ src, type }: { src?: string | null; type: ArtifactType }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div aria-hidden="true" className="library-thumbnail">
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
          onError={() => setFailed(src)}
        />
      )}
    </div>
  );
}
