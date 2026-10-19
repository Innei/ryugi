export function resolveAnchor(blockText: string, quote: string): { start: number; end: number } | 'block' {
  if (!quote) return 'block';
  const start = blockText.indexOf(quote);
  return start === -1 ? 'block' : { start, end: start + quote.length };
}
