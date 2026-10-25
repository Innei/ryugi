import { setContextMenuInterceptor, showContextMenu, type ContextMenuItem } from '@lobehub/ui';
import { useSyncExternalStore, type MouseEvent } from 'react';

let target: string | null = null;
const listeners = new Set<() => void>();

const setTarget = (next: string | null) => {
  if (target === next) return;
  target = next;
  for (const listener of listeners) listener();
};

setContextMenuInterceptor({
  show: (_items, _options, fallback) => {
    setTarget(null);
    fallback();
  },
  close: (fallback) => {
    fallback();
    setTarget(null);
  },
});

export function openContextMenu(event: MouseEvent, key: string, items: ContextMenuItem[], options?: Parameters<typeof showContextMenu>[1]) {
  event.preventDefault();
  showContextMenu(items, options);
  setTarget(key);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function useContextMenuTarget() {
  return useSyncExternalStore(subscribe, () => target, () => null);
}
