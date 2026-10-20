import { useEffect, useRef, useState } from 'react';
import type { ArtifactSummary } from '../../shared/types';

export function ArtifactThumbnail({ artifact }: { artifact: ArtifactSummary }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 140 });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = ref.current!;
    const intersection = new IntersectionObserver(([entry]) => setVisible(entry!.isIntersecting), { rootMargin: '160px' });
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize({ width, height });
    });
    intersection.observe(element);
    resize.observe(element);
    return () => { intersection.disconnect(); resize.disconnect(); };
  }, []);

  useEffect(() => setFailed(false), [artifact.updatedAt]);
  const scale = size.width / 1000;
  return (
    <div ref={ref} className="library-thumbnail" aria-hidden="true" inert>
      <span>{failed ? '预览暂不可用' : '正在加载预览…'}</span>
      {visible && scale > 0 && !failed && (
        <iframe
          key={artifact.updatedAt}
          src={`/preview/${artifact.type}/${artifact.id}?v=${artifact.updatedAt}`}
          title={`${artifact.title} 预览`}
          sandbox="allow-scripts allow-same-origin"
          tabIndex={-1}
          onError={() => setFailed(true)}
          style={{ width: 1000, height: size.height / scale, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}
