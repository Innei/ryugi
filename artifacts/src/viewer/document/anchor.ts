export function resolveAnchor(
  blockText: string,
  quote: string,
): { start: number; end: number } | 'block' {
  if (!quote) return 'block';
  const start = blockText.indexOf(quote);
  return start === -1 ? 'block' : { start, end: start + quote.length };
}

export function shownThreadIds(
  threads: { id: string; status: 'open' | 'resolved' }[],
  activeId: string | null,
): Set<string> {
  return new Set(
    threads
      .filter((thread) => thread.status === 'open' || thread.id === activeId)
      .map((thread) => thread.id),
  );
}
