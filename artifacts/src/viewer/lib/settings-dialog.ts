import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

const set = (value: boolean) => {
  if (open === value) return;
  open = value;
  for (const listener of listeners) listener();
};

export const openSettings = () => set(true);
export const closeSettings = () => set(false);
export const settingsOpen = () => open;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useSettingsOpen = () => useSyncExternalStore(subscribe, settingsOpen, settingsOpen);
