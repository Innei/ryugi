import { useEffect, useRef, useState } from 'react';
export function ArtifactThumbnail({ title, src, version }: { title: string; src: string; version: string | number }) {
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

  useEffect(() => setFailed(false), [version]);
  const scale = size.width / 1000;
  return (
    <div ref={ref} className="library-thumbnail" aria-hidden="true" inert>
      <span>{failed ? '预览暂不可用' : '正在加载预览…'}</span>
      {visible && scale > 0 && !failed && (
        <iframe
          key={version}
          src={src}
          title={`${title} 预览`}
          sandbox="allow-scripts allow-same-origin"
          tabIndex={-1}
          onError={() => setFailed(true)}
          style={{ width: 1000, height: size.height / scale, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}
