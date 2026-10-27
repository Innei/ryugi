import './thumbnail.css';
import { useState } from 'react';
import type { ArtifactType } from '../../shared/types';
import { TypeIcon } from './TypeIcon';

export function ArtifactThumbnail({ src, type }: { src?: string | null; type: ArtifactType }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className="library-thumbnail" aria-hidden="true">
      <TypeIcon type={type} size={24} />
      {src && failed !== src && <img key={src} src={src} alt="" width={600} height={360} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(src)} />}
    </div>
  );
}
