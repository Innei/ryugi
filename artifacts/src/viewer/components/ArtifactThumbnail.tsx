import './thumbnail.css';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';

const retained = new Map<object, () => void>();

export function ArtifactThumbnail({ title, src, version }: { title: string; src: string; version: string | number }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const slot = useRef({});
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

  useEffect(() => {
    const key = slot.current;
    retained.delete(key);
    if (visible) setMounted(true);
    else if (mounted) {
      retained.set(key, () => setMounted(false));
      // Keep recent offscreen frames so scrolling back does not reload their resources.
      if (retained.size > 8) {
        const [oldest, release] = retained.entries().next().value!;
        retained.delete(oldest);
        release();
      }
    }
    return () => { retained.delete(key); };
  }, [visible, mounted]);

  useEffect(() => setFailed(false), [version]);
  const scale = size.width / 1000;
  return (
    <div ref={ref} className="library-thumbnail" aria-hidden="true" inert>
      <span>{failed ? t('preview.unavailable') : t('preview.loading')}</span>
      {mounted && scale > 0 && !failed && (
        <iframe
          key={version}
          src={src}
          title={t('preview.frameTitle', { title })}
          sandbox="allow-scripts allow-same-origin"
          tabIndex={-1}
          onError={() => setFailed(true)}
          style={{ width: 1000, height: size.height / scale, transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}
