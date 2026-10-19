import type { BoardSpec } from '../../shared/types';

export function togglePlaying(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (!next.delete(id)) next.add(id);
  return next;
}

export const boardReady = (versions: Record<string, number>, file: string) => (versions[file] ?? 0) > 0;

export const canPlay = (board: BoardSpec, versions: Record<string, number>) =>
  board.interactive === true && boardReady(versions, board.file);

export const boardSrc = (contentBase: string, file: string, version: number, replay: number) =>
  `${contentBase}${file}?v=${version}${replay > 0 ? `&r=${replay}` : ''}`;
