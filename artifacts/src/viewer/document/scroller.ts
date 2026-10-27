import { animateValue } from 'motion';
import { reducedMotion } from './motion';

export function springScrollToElement(element: HTMLElement) {
  const target = Math.max(
    0,
    Math.min(
      window.scrollY + element.getBoundingClientRect().top - 100,
      document.documentElement.scrollHeight - window.innerHeight,
    ),
  );
  if (reducedMotion()) {
    window.scrollTo({ top: target, behavior: 'instant' });
    return () => {};
  }

  const cleanup = () => {
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchmove', stop);
  };
  const stop = () => {
    animation.stop();
    cleanup();
  };
  // Same spring as Yohaku; +1 keeps Motion from dropping a zero starting keyframe.
  const animation = animateValue({
    keyframes: [window.scrollY + 1, target],
    type: 'spring',
    stiffness: 1000,
    damping: 250,
    onUpdate: (top) => window.scrollTo({ top, behavior: 'instant' }),
    onComplete: cleanup,
  });
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchmove', stop, { passive: true });
  return stop;
}
