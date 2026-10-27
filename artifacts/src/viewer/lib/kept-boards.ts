export const KEPT_MAX = 6;

export interface KeptBoard { id: string; version: number }

export function keepBoard(list: readonly KeptBoard[], id: string, version: number): KeptBoard[] {
  const next = [...list.filter((entry) => entry.id !== id), { id, version }];
  return next.slice(Math.max(0, next.length - KEPT_MAX));
}

export function pruneKept(list: KeptBoard[], current: ReadonlyMap<string, number>): KeptBoard[] {
  const next = list.filter((entry) => current.get(entry.id) === entry.version);
  return next.length === list.length ? list : next;
}
