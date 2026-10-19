export function togglePlaying(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current);
  if (!next.delete(id)) next.add(id);
  return next;
}

export const boardSrc = (contentBase: string, file: string, version: number, replay: number) =>
  `${contentBase}${file}?v=${version}${replay > 0 ? `&r=${replay}` : ''}`;
